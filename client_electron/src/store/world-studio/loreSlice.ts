import { worldsApi } from '../../api/worldsApi';
import type { WorldLoreDraftItem } from '../../types/api';
import { readLoreFileWithEncoding } from '../../utils/loreFileUtils';
import { useGameStore } from '../useGameStore';
import {
  isWorldActionBlockedOffline,
  makeUniqueLoreFilename,
  persistDraftIfCreate,
  syncLoreHeadingWithTitle,
} from './helpers';
import type { LoreSlice, WorldStudioSliceCreator } from './types';

export const createLoreSlice: WorldStudioSliceCreator<LoreSlice> = (set, get) => ({
  loreArticles: [],
  selectedLoreFilename: null,
  dirtyLoreFilenames: [],
  loreGenProgress: null,
  isMutatingLore: false,

  setSelectedLoreFilename: (filename) => set({ selectedLoreFilename: filename }),

  updateLoreArticleLocal: (filename, patch) => {
    set((state) => {
      const nextArticles = state.loreArticles.map((art) =>
        art.filename === filename ? { ...art, ...patch } : art
      );
      const nextDirtyLore =
        state.mode === 'edit' && !state.dirtyLoreFilenames.includes(filename)
          ? [...state.dirtyLoreFilenames, filename]
          : state.dirtyLoreFilenames;
      return {
        loreArticles: nextArticles,
        dirtyLoreFilenames: nextDirtyLore,
        isDirty: true,
      };
    });
    persistDraftIfCreate(get());
  },

  saveLoreArticleRemote: async (filename) => {
    const { mode, editingWorldId, loreArticles } = get();
    if (mode !== 'edit' || !editingWorldId) return true;
    if (isWorldActionBlockedOffline('операція збереження статті на сервері')) return false;
    const article = loreArticles.find((a) => a.filename === filename);
    if (!article) return false;

    const syncedContent = syncLoreHeadingWithTitle(article.title, article.content);
    set({ isMutatingLore: true });
    try {
      await worldsApi.saveLoreArticle(editingWorldId, article.filename, syncedContent);
      set((state) => ({
        loreArticles: state.loreArticles.map((a) =>
          a.filename === filename ? { ...a, content: syncedContent } : a
        ),
        dirtyLoreFilenames: state.dirtyLoreFilenames.filter((f) => f !== filename),
        isMutatingLore: false,
      }));
      useGameStore.getState().setSystemAlert(`Статтю «${article.title}» збережено`, 'success');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка збереження статті';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося зберегти статтю: ${message}`, 'error');
      set({ isMutatingLore: false });
      return false;
    }
  },

  createManualLoreArticle: async (title) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const { mode, editingWorldId, loreArticles } = get();
    const filename = makeUniqueLoreFilename(cleanTitle, loreArticles, '.md');
    const newItem: WorldLoreDraftItem = {
      filename,
      title: cleanTitle,
      content: `# ${cleanTitle}\n\n`,
    };

    if (mode === 'edit' && editingWorldId) {
      if (isWorldActionBlockedOffline('операція створення статті на сервері')) return;
      set({ isMutatingLore: true });
      try {
        await worldsApi.saveLoreArticle(editingWorldId, filename, newItem.content);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Помилка створення статті';
        useGameStore.getState().setSystemAlert(message, 'error');
        set({ isMutatingLore: false });
        return;
      }
    }

    set((state) => ({
      loreArticles: [...state.loreArticles, newItem],
      selectedLoreFilename: filename,
      isMutatingLore: false,
      isDirty: true,
    }));
    persistDraftIfCreate(get());
  },

  createAiLoreArticle: async (topicText) => {
    const cleanTopic = topicText.trim();
    if (!cleanTopic || get().isMutatingLore || get().loreGenProgress?.active) return;
    if (isWorldActionBlockedOffline('ШІ-генерація статті лору')) return;

    const { mode, editingWorldId, passport, aiPrompts, loreArticles } = get();
    const hasPrompts = Object.values(aiPrompts).some((v) => v.trim().length > 0);
    const candidateFilename = makeUniqueLoreFilename(cleanTopic, loreArticles, '.md');

    set({ isMutatingLore: true });
    try {
      const res = await worldsApi.wizardGenerateLore({
        mode: 'generate_article',
        passport,
        ai_prompts: hasPrompts ? aiPrompts : undefined,
        topic: cleanTopic,
        filename: candidateFilename,
        existing_titles: loreArticles.map((a) => a.title),
      });

      const generated = res.article;
      if (!generated) {
        throw new Error('ШІ не повернув текст статті');
      }

      const uniqueFilename = makeUniqueLoreFilename(
        generated.filename || candidateFilename,
        loreArticles,
        '.md'
      );
      const item: WorldLoreDraftItem = {
        filename: uniqueFilename,
        title: generated.title || cleanTopic,
        content: generated.content || `# ${cleanTopic}\n`,
      };

      if (mode === 'edit' && editingWorldId) {
        await worldsApi.saveLoreArticle(editingWorldId, item.filename, item.content);
      }

      set((state) => ({
        loreArticles: [...state.loreArticles, item],
        selectedLoreFilename: item.filename,
        isMutatingLore: false,
        isDirty: true,
      }));
      persistDraftIfCreate(get());
      useGameStore
        .getState()
        .setSystemAlert(`Статтю «${item.title}» згенеровано`, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка генерації статті';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося згенерувати статтю лору: ${message}`, 'error');
      set({ isMutatingLore: false });
    }
  },

  generateStarterLore: async () => {
    const { passport, aiPrompts, mode, editingWorldId, loreGenProgress, isMutatingLore } = get();
    if (loreGenProgress?.active || isMutatingLore) return;
    if (isWorldActionBlockedOffline('ШІ-генерація стартового лору')) return;

    if (!passport.title.trim()) {
      useGameStore
        .getState()
        .setSystemAlert('Спочатку вкажіть назву світу на Кроці 1.', 'warning');
      return;
    }

    const hasPrompts = Object.values(aiPrompts).some((v) => v.trim().length > 0);
    set({
      loreGenProgress: {
        active: true,
        current: 0,
        total: 5,
        currentTitle: 'Планування 5 тем лору...',
      },
    });

    try {
      const planRes = await worldsApi.wizardGenerateLore({
        mode: 'plan_topics',
        passport,
        ai_prompts: hasPrompts ? aiPrompts : undefined,
        existing_titles: get().loreArticles.map((a) => a.title),
      });

      const topics = Array.isArray(planRes.topics) ? planRes.topics : [];
      if (topics.length === 0) {
        throw new Error('Не вдалося сформувати список тем для лору');
      }

      for (let i = 0; i < topics.length; i++) {
        const topicItem = topics[i];
        set({
          loreGenProgress: {
            active: true,
            current: i + 1,
            total: topics.length,
            currentTitle: topicItem.title,
          },
        });

        const currentArticles = get().loreArticles;
        const articleRes = await worldsApi.wizardGenerateLore({
          mode: 'generate_article',
          passport,
          ai_prompts: hasPrompts ? aiPrompts : undefined,
          topic: topicItem.brief
            ? `${topicItem.title} — ${topicItem.brief}`
            : topicItem.title,
          filename: topicItem.filename,
          existing_titles: currentArticles.map((a) => a.title),
        });

        if (articleRes.article) {
          const uniqueFilename = makeUniqueLoreFilename(
            articleRes.article.filename || topicItem.filename,
            currentArticles,
            '.md'
          );
          const draftItem: WorldLoreDraftItem = {
            filename: uniqueFilename,
            title: articleRes.article.title || topicItem.title,
            content: articleRes.article.content || '',
          };

          if (mode === 'edit' && editingWorldId) {
            await worldsApi.saveLoreArticle(
              editingWorldId,
              draftItem.filename,
              draftItem.content
            );
          }

          set((state) => ({
            loreArticles: [...state.loreArticles, draftItem],
            selectedLoreFilename: state.selectedLoreFilename || draftItem.filename,
            isDirty: true,
          }));
          persistDraftIfCreate(get());
        }
      }

      set({ loreGenProgress: null });
      useGameStore
        .getState()
        .setSystemAlert(`Згенеровано ${topics.length} стартових статей лору`, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка генерації лору';
      useGameStore
        .getState()
        .setSystemAlert(`Помилка генерації стартового лору: ${message}`, 'error');
      set({ loreGenProgress: null });
    }
  },

  expandLoreArticle: async (filename, instruction) => {
    const cleanInstruction = instruction.trim();
    if (!cleanInstruction || get().isMutatingLore || get().loreGenProgress?.active) return;
    if (isWorldActionBlockedOffline('ШІ-редагування статті лору')) return;

    const { mode, editingWorldId, passport, aiPrompts, loreArticles } = get();
    const target = loreArticles.find((a) => a.filename === filename);
    if (!target) return;

    const hasPrompts = Object.values(aiPrompts).some((v) => v.trim().length > 0);
    set({ isMutatingLore: true });

    try {
      const res = await worldsApi.wizardGenerateLore({
        mode: 'expand_article',
        passport,
        ai_prompts: hasPrompts ? aiPrompts : undefined,
        topic: target.title,
        filename: target.filename,
        existing_content: target.content,
        instruction: cleanInstruction,
      });

      const updated = res.article;
      if (!updated) {
        throw new Error('ШІ не повернув оновлений текст статті');
      }

      const nextTitle = updated.title || target.title;
      const nextContent = updated.content || target.content;

      if (mode === 'edit' && editingWorldId) {
        await worldsApi.saveLoreArticle(editingWorldId, target.filename, nextContent);
      }

      set((state) => ({
        loreArticles: state.loreArticles.map((art) =>
          art.filename === filename
            ? { ...art, title: nextTitle, content: nextContent }
            : art
        ),
        dirtyLoreFilenames: state.dirtyLoreFilenames.filter((f) => f !== filename),
        isMutatingLore: false,
        isDirty: true,
      }));
      persistDraftIfCreate(get());
      useGameStore
        .getState()
        .setSystemAlert(`Статтю «${nextTitle}» оновлено за допомогою ШІ`, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка розширення статті';
      useGameStore
        .getState()
        .setSystemAlert(`Не вдалося доповнити статтю: ${message}`, 'error');
      set({ isMutatingLore: false });
    }
  },

  importLoreFile: async (file) => {
    const { mode, editingWorldId } = get();
    if (mode === 'edit' && editingWorldId && isWorldActionBlockedOffline('операція імпорту у світ')) {
      return;
    }
    set({ isMutatingLore: true });

    try {
      const parsed = await readLoreFileWithEncoding(file);
      const uniqueFilename = makeUniqueLoreFilename(
        parsed.filename,
        get().loreArticles,
        parsed.filename.endsWith('.txt') ? '.txt' : '.md'
      );

      const newItem: WorldLoreDraftItem = {
        filename: uniqueFilename,
        title: parsed.title,
        content: parsed.content,
      };

      if (mode === 'edit' && editingWorldId) {
        await worldsApi.saveLoreArticle(editingWorldId, newItem.filename, newItem.content);
      }

      set((state) => ({
        loreArticles: [...state.loreArticles, newItem],
        selectedLoreFilename: newItem.filename,
        isMutatingLore: false,
        isDirty: true,
      }));
      persistDraftIfCreate(get());
      useGameStore
        .getState()
        .setSystemAlert(
          `Файл «${file.name}» імпортовано (${parsed.encoding})`,
          'success'
        );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Помилка імпорту файлу';
      useGameStore.getState().setSystemAlert(message, 'error');
      set({ isMutatingLore: false });
    }
  },

  deleteLoreArticleItem: async (filename) => {
    const { mode, editingWorldId, loreArticles, selectedLoreFilename } = get();

    if (mode === 'edit' && editingWorldId) {
      if (isWorldActionBlockedOffline('операція видалення статті на сервері')) return;
      set({ isMutatingLore: true });
      try {
        await worldsApi.deleteLoreArticle(editingWorldId, filename);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Помилка видалення статті';
        useGameStore.getState().setSystemAlert(message, 'error');
        set({ isMutatingLore: false });
        return;
      }
    }

    const remaining = loreArticles.filter((a) => a.filename !== filename);
    const nextSelected =
      selectedLoreFilename === filename
        ? remaining[0]?.filename || null
        : selectedLoreFilename;

    set((state) => ({
      loreArticles: remaining,
      selectedLoreFilename: nextSelected,
      dirtyLoreFilenames: state.dirtyLoreFilenames.filter((f) => f !== filename),
      isMutatingLore: false,
      isDirty: true,
    }));
    persistDraftIfCreate(get());
  },
});
