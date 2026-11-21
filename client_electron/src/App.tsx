import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { HeaderStatusBar } from './components/character-drawer/HeaderStatusBar';
import { DrawerSheet } from './components/character-drawer/DrawerSheet';
import { ChatContainer } from './components/chat/ChatContainer';
import { WizardScreen } from './components/character-wizard/WizardScreen';
import { WorldStudioScreen } from './components/worlds/WorldStudioScreen';
import {
  CharacterEditorModal,
  type CharacterEditorMode,
} from './components/character-editor';
import { NewCampaignModal } from './components/sidebar/NewCampaignModal';
import { ConfirmModal } from './components/ui/ConfirmModal';
import { CloneWorldModal } from './components/worlds/CloneWorldModal';
import { GlobalContextMenu } from './components/ui/GlobalContextMenu';
import { GlobalTooltip } from './components/ui/GlobalTooltip';
import { charactersApi } from './api/charactersApi';
import { subscribeNetworkStatus } from './api/client';
import { gameApi } from './api/gameApi';
import { extractWorldDeleteConflict, worldsApi } from './api/worldsApi';
import { DEFAULT_WORLD_ID } from './store/game/worldSlice';
import { useGameStore } from './store/useGameStore';
import { useWizardStore } from './store/useWizardStore';
import { useWorldStudioStore } from './store/useWorldStudioStore';
import type {
  CharacterSummary,
  CampaignSummary,
  PlayerState,
  WorldSummary,
} from './types/api';

export const App: React.FC = () => {
  const {
    loadWorlds,
    selectWorld,
    loadCharacters,
    updateCharacter,
    updateCampaignState,
    deleteCampaign,
    deleteCharacter,
    setBackendOffline,
    setSystemAlert,
  } = useGameStore();
  const openWizard = useWizardStore((s) => s.openWizard);
  const openCreateStudio = useWorldStudioStore((s) => s.openCreateStudio);
  const openEditStudio = useWorldStudioStore((s) => s.openEditStudio);

  // Стан модальних вікон
  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);
  const [editorConfig, setEditorConfig] = useState<{
    mode: CharacterEditorMode;
    targetId: string;
    initialState: PlayerState | Record<string, any>;
  } | null>(null);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);

  const [campaignToDelete, setCampaignToDelete] = useState<CampaignSummary | null>(null);
  const [characterToDelete, setCharacterToDelete] = useState<CharacterSummary | null>(null);
  const [worldToClone, setWorldToClone] = useState<WorldSummary | null>(null);
  const [worldDeletePrompt, setWorldDeletePrompt] = useState<{
    world: WorldSummary;
    mode: 'empty' | 'cascade';
    dependentCharacters?: number;
    dependentCampaigns?: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingWorld, setIsDeletingWorld] = useState(false);

  const hasHydratedWorkspaceRef = useRef(false);
  const isHydratingRef = useRef(false);
  const isCheckingHealthRef = useRef(false);

  const hydrateWorkspace = useCallback(async () => {
    if (isHydratingRef.current) return;
    isHydratingRef.current = true;
    try {
      await loadWorlds();
      await loadCharacters();
      const { backendOffline, worlds } = useGameStore.getState();
      if (!backendOffline && worlds.length > 0) {
        hasHydratedWorkspaceRef.current = true;
      }
    } catch (err) {
      console.warn('Не вдалося ініціалізувати світи й героїв під час старту:', err);
    } finally {
      isHydratingRef.current = false;
    }
  }, [loadWorlds, loadCharacters]);

  // Завантаження світів та персонажів на старті + живий heartbeat моніторинг GET /api/v1/health
  useEffect(() => {
    void hydrateWorkspace();

    const handleOnlineTransition = () => {
      if (!hasHydratedWorkspaceRef.current) {
        void hydrateWorkspace();
      }
    };

    const unsubscribe = subscribeNetworkStatus((isOffline) => {
      const prevOffline = useGameStore.getState().backendOffline;
      if (isOffline !== prevOffline) {
        setBackendOffline(isOffline);
        if (!isOffline) {
          setSystemAlert("Зв'язок із сервером гри відновлено", 'success');
          handleOnlineTransition();
        }
      } else if (!isOffline && !hasHydratedWorkspaceRef.current) {
        handleOnlineTransition();
      }
    });

    const checkHealthOnce = async () => {
      if (isCheckingHealthRef.current) return;
      isCheckingHealthRef.current = true;
      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 3000);

      try {
        await gameApi.checkHealth(controller.signal);
        const prevOffline = useGameStore.getState().backendOffline;
        if (prevOffline) {
          setBackendOffline(false);
          setSystemAlert("Зв'язок із сервером гри відновлено", 'success');
        }
        if (!hasHydratedWorkspaceRef.current) {
          void hydrateWorkspace();
        }
      } catch (err: unknown) {
        if (timedOut || (err instanceof Error && err.name !== 'AbortError')) {
          if (!useGameStore.getState().backendOffline) {
            setBackendOffline(true);
          }
        }
      } finally {
        clearTimeout(timeoutId);
        isCheckingHealthRef.current = false;
      }
    };

    const intervalId = setInterval(() => {
      void checkHealthOnce();
    }, 5000);

    const handleWindowFocus = () => {
      void checkHealthOnce();
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [hydrateWorkspace, setBackendOffline, setSystemAlert]);

  // Режим A — Редагування заготовки персонажа (завжди підвантажуємо актуальний стан заготовки)
  const handleEditCharacter = async (char: CharacterSummary) => {
    if (isOpeningEditor) return;
    try {
      setIsOpeningEditor(true);
      const blueprintState = await charactersApi.getCharacter(char.char_id);
      setEditorConfig({
        mode: 'blueprint',
        targetId: char.char_id,
        initialState: blueprintState,
      });
    } catch (err: any) {
      setSystemAlert(
        `Не вдалося завантажити заготовку героя: ${err?.message || 'Помилка'}`,
        'error'
      );
    } finally {
      setIsOpeningEditor(false);
    }
  };

  // Режим B — Редагування живого листа поточної кампанії
  const handleEditLiveSheet = () => {
    const state = useGameStore.getState();
    const liveState = state.playerState || state.activeCharacter;
    if (!state.activeCampaignId || !liveState) return;
    setEditorConfig({
      mode: 'live_state',
      targetId: state.activeCampaignId,
      initialState: liveState,
    });
  };

  // Видалення кампанії
  const handleConfirmDeleteCampaign = async () => {
    if (!campaignToDelete || isDeleting) return;
    const campId = campaignToDelete.campaign_id;
    try {
      setIsDeleting(true);
      await deleteCampaign(campId);
      setCampaignToDelete(null);
      setSystemAlert('Кампанію успішно видалено', 'info');
    } catch (err: any) {
      setSystemAlert(`Помилка видалення кампанії: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Видалення персонажа
  const handleConfirmDeleteCharacter = async () => {
    if (!characterToDelete || isDeleting) return;
    const charId = characterToDelete.char_id;
    try {
      setIsDeleting(true);
      await deleteCharacter(charId);
      setCharacterToDelete(null);
      setSystemAlert('Персонажа успішно видалено', 'info');
    } catch (err: any) {
      setSystemAlert(`Помилка видалення героя: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Пост-обробка після видалення світу
  const finishWorldDeletion = async (deletedWorld: WorldSummary) => {
    const currentActiveId = useGameStore.getState().activeWorldId;
    await loadWorlds();
    if (currentActiveId === deletedWorld.world_id) {
      const remainingWorlds = useGameStore.getState().worlds;
      const fallbackWorldId =
        remainingWorlds.find((w) => w.is_default)?.world_id ||
        remainingWorlds[0]?.world_id ||
        DEFAULT_WORLD_ID;
      await selectWorld(fallbackWorldId);
    }
    setSystemAlert(`Світ «${deletedWorld.title}» видалено`, 'info');
  };

  // Обов'язкове підтвердження видалення будь-якого не-дефолтного світу
  const handleRequestDeleteWorld = (world: WorldSummary) => {
    if (world.is_default) {
      setSystemAlert('Базовий світ неможливо видалити', 'warning');
      return;
    }
    if (useGameStore.getState().backendOffline) {
      setSystemAlert('Сервер офлайн — видалення світу тимчасово недоступне', 'warning');
      return;
    }
    if (isDeletingWorld) return;

    if (world.character_count > 0) {
      setWorldDeletePrompt({
        world,
        mode: 'cascade',
        dependentCharacters: world.character_count,
      });
      return;
    }

    setWorldDeletePrompt({
      world,
      mode: 'empty',
    });
  };

  // Підтверджене видалення світу (cascade=false з fallback на 409 або cascade=true)
  const handleConfirmDeleteWorld = async () => {
    if (!worldDeletePrompt || isDeletingWorld) return;
    const { world: targetWorld, mode } = worldDeletePrompt;
    const useCascade = mode === 'cascade';

    try {
      setIsDeletingWorld(true);
      await worldsApi.deleteWorld(targetWorld.world_id, useCascade);
      setWorldDeletePrompt(null);
      await finishWorldDeletion(targetWorld);
    } catch (err: unknown) {
      const conflict = !useCascade ? extractWorldDeleteConflict(err) : null;
      if (conflict) {
        setWorldDeletePrompt({
          world: targetWorld,
          mode: 'cascade',
          dependentCharacters: conflict.dependent_characters,
          dependentCampaigns: conflict.dependent_campaigns,
        });
      } else {
        const message = err instanceof Error ? err.message : 'Невідома помилка';
        setSystemAlert(`Помилка видалення світу: ${message}`, 'error');
      }
    } finally {
      setIsDeletingWorld(false);
    }
  };

  return (
    <AppLayout
      onOpenWizard={() => {
        openWizard();
      }}
      onCreateWorld={() => {
        openCreateStudio();
      }}
      onEditWorld={(world) => {
        void openEditStudio(world.world_id);
      }}
      onCloneWorld={(world) => setWorldToClone(world)}
      onRequestDeleteWorld={handleRequestDeleteWorld}
      onEditCharacter={handleEditCharacter}
      onRequestDeleteCharacter={(char) => setCharacterToDelete(char)}
      onNewCampaign={() => setIsNewCampaignModalOpen(true)}
      onRequestDeleteCampaign={(camp) => setCampaignToDelete(camp)}
      onOpenSettings={() => {
        setSystemAlert('Меню налаштувань у розробці.', 'info');
      }}
      onLogout={() => {
        setSystemAlert('Вихід з акаунту здійснено. Дані сесії скинуто.', 'info');
      }}
    >
      {/* 1. ІГРОВИЙ ЕКРАН (відступи 42px 16px 24px 24px) */}
      <div className="flex-1 overflow-hidden pl-[42px] pt-[16px] pr-[24px] pb-[24px] flex flex-col justify-between">
        {/* ВЕРХНЯ ПАНЕЛЬ: Картка персонажа Button.characterCard + Висувна шторка Border.drawerSheet */}
        <div className="mb-4 flex flex-col gap-1 shrink-0">
          <HeaderStatusBar />
          <DrawerSheet onEditLiveSheet={handleEditLiveSheet} />
        </div>

        {/* ЄДИНИЙ ЧАТ КАМПАНІЇ (ЛОГ ПОВІДОМЛЕНЬ + ВКЛАДЕНИЙ ДОК ІНПУТУ) */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <ChatContainer onNewCampaign={() => setIsNewCampaignModalOpen(true)} />
        </div>
      </div>

      {/* 2. ПОВНОЕКРАННИЙ ВІЗАРД ТВОРЦЯ ДОЛІ */}
      <WizardScreen />

      {/* 2.5. ПОВНОЕКРАННА СТУДІЯ СВІТІВ (4-КРОКОВИЙ AI-МАЙСТЕР / РЕДАКТОР СВІТІВ) */}
      <WorldStudioScreen />

      {/* 3. СТУДІЯ РЕДАГУВАННЯ ПЕРСОНАЖА (Режим A: Заготовка / Режим B: Живий лист) */}
      <CharacterEditorModal
        isOpen={!!editorConfig}
        mode={editorConfig?.mode ?? 'blueprint'}
        targetId={editorConfig?.targetId ?? null}
        initialState={editorConfig?.initialState ?? null}
        onClose={() => setEditorConfig(null)}
        onSave={async (targetId, updatedState) => {
          if (editorConfig?.mode === 'live_state') {
            await updateCampaignState(targetId, updatedState);
          } else {
            await updateCharacter(targetId, updatedState);
          }
        }}
      />

      {/* 4. МОДАЛЬНЕ ВІКНО: СТВОРЕННЯ НОВОЇ КАМПАНІЇ */}
      <NewCampaignModal
        isOpen={isNewCampaignModalOpen}
        onClose={() => setIsNewCampaignModalOpen(false)}
      />

      {/* 5. УНІВЕРСАЛЬНЕ МОДАЛЬНЕ ВІКНО: ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ КАМПАНІЇ */}
      <ConfirmModal
        isOpen={!!campaignToDelete}
        onClose={() => setCampaignToDelete(null)}
        onConfirm={handleConfirmDeleteCampaign}
        title="Видалити кампанію?"
        message={`Ви впевнені, що бажаєте безповоротно видалити кампанію «${campaignToDelete?.title}»? Увесь збережений прогрес та історія чату цієї кампанії будуть втрачені.`}
        confirmText="Так, видалити"
        cancelText="Ні, залишити"
        isLoading={isDeleting}
      />

      {/* 6. УНІВЕРСАЛЬНЕ МОДАЛЬНЕ ВІКНО: ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ ПЕРСОНАЖА */}
      <ConfirmModal
        isOpen={!!characterToDelete}
        onClose={() => setCharacterToDelete(null)}
        onConfirm={handleConfirmDeleteCharacter}
        title="Видалити персонажа?"
        message={`Ви впевнені, що бажаєте видалити героя «${characterToDelete?.name}» та всі пов'язані з ним кампанії?`}
        confirmText="Так, видалити"
        cancelText="Ні, залишити"
        isLoading={isDeleting}
      />

      {/* 7. КЛОНУВАННЯ СВІТУ */}
      <CloneWorldModal
        isOpen={!!worldToClone}
        sourceWorld={worldToClone}
        onClose={() => setWorldToClone(null)}
      />

      {/* 8. ОБОВ'ЯЗКОВЕ ПІДТВЕРДЖЕННЯ ВИДАЛЕННЯ СВІТУ (порожній або каскадне з 409 Conflict) */}
      <ConfirmModal
        isOpen={!!worldDeletePrompt}
        onClose={() => setWorldDeletePrompt(null)}
        onConfirm={handleConfirmDeleteWorld}
        title={
          worldDeletePrompt?.mode === 'cascade'
            ? 'Видалити світ разом із героями?'
            : `Видалити світ «${worldDeletePrompt?.world.title || ''}»?`
        }
        message={
          worldDeletePrompt?.mode === 'cascade'
            ? worldDeletePrompt.dependentCampaigns !== undefined
              ? `У світі «${worldDeletePrompt.world.title}» є ${worldDeletePrompt.dependentCharacters ?? 0} героїв та ${worldDeletePrompt.dependentCampaigns} кампаній. Видалити світ разом з усіма його героями, кампаніями, промптами та базою лору?`
              : `У світі «${worldDeletePrompt.world.title}» є ${worldDeletePrompt.dependentCharacters ?? 0} героїв. Видалити світ разом з усіма його героями, кампаніями, налаштуваннями, промптами та базою лору?`
            : `Ви впевнені, що бажаєте безповоротно видалити світ «${worldDeletePrompt?.world.title || ''}»? Усі його налаштування, промпти ШІ, шаблон анкети та база лору будуть втрачені.`
        }
        confirmText={worldDeletePrompt?.mode === 'cascade' ? 'Так, видалити все' : 'Так, видалити'}
        cancelText="Ні, залишити"
        isLoading={isDeletingWorld}
      />

      {/* 9. ГЛОБАЛЬНЕ КОНТЕКСТНЕ МЕНЮ ПКМ ДЛЯ ВСІХ ІНПУТІВ, TEXTAREA ТА ЧАТІВ */}
      <GlobalContextMenu />

      {/* 10. ГЛОБАЛЬНІ ТЕМНІ ПОРТАЛЬНІ ТУЛТІПИ ЗАМІСТЬ СИСТЕМНИХ БІЛИХ ПІДКАЗОК */}
      <GlobalTooltip />
    </AppLayout>
  );
};

export default App;