import React, { useState, useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { HeaderStatusBar } from './components/character-drawer/HeaderStatusBar';
import { DrawerSheet } from './components/character-drawer/DrawerSheet';
import { ChatContainer } from './components/chat/ChatContainer';
import { ChatInput } from './components/input/ChatInput';
import { WizardScreen } from './components/wizard/WizardScreen';
import { WorldStudioScreen } from './components/worlds/WorldStudioScreen';
import {
  CharacterEditorModal,
  type CharacterEditorMode,
} from './components/character-editor';
import { NewCampaignModal } from './components/modals/NewCampaignModal';
import { ConfirmModal } from './components/modals/ConfirmModal';
import { CloneWorldModal } from './components/worlds/CloneWorldModal';
import { GlobalContextMenu } from './components/ui/GlobalContextMenu';
import { charactersApi } from './api/charactersApi';
import { extractWorldDeleteConflict, worldsApi } from './api/worldsApi';
import { DEFAULT_WORLD_ID } from './store/slices/worldSlice';
import { useGameStore } from './store/useGameStore';
import { useWizardStore } from './store/useWizardStore';
import { useWorldStudioStore } from './store/useWorldStudioStore';
import type {
  CharacterSummary,
  CampaignSummary,
  PlayerState,
  WorldDeleteConflict,
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
  const [worldDeleteConflict, setWorldDeleteConflict] = useState<{
    world: WorldSummary;
    conflict: WorldDeleteConflict;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingWorld, setIsDeletingWorld] = useState(false);

  // Завантаження світів та персонажів на старті (з урахуванням activeWorldId)
  useEffect(() => {
    const initWorkspace = async () => {
      await loadWorlds();
      await loadCharacters();
    };
    initWorkspace().catch((err) => {
      console.warn('Не вдалося ініціалізувати світи й героїв під час старту:', err);
    });
  }, [loadWorlds, loadCharacters]);

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

  // Безпечне видалення світу: спочатку cascade=false, при 409 Conflict відкриває ConfirmModal
  const handleRequestDeleteWorld = async (world: WorldSummary) => {
    if (world.is_default) {
      setSystemAlert('Базовий світ неможливо видалити', 'info');
      return;
    }
    if (isDeletingWorld) return;
    try {
      setIsDeletingWorld(true);
      await worldsApi.deleteWorld(world.world_id, false);
      await finishWorldDeletion(world);
    } catch (err: unknown) {
      const conflict = extractWorldDeleteConflict(err);
      if (conflict) {
        setWorldDeleteConflict({ world, conflict });
      } else {
        const message = err instanceof Error ? err.message : 'Невідома помилка';
        setSystemAlert(`Помилка видалення світу: ${message}`, 'error');
      }
    } finally {
      setIsDeletingWorld(false);
    }
  };

  // Каскадне видалення світу після підтвердження користувачем
  const handleConfirmCascadeDeleteWorld = async () => {
    if (!worldDeleteConflict || isDeletingWorld) return;
    const targetWorld = worldDeleteConflict.world;
    try {
      setIsDeletingWorld(true);
      await worldsApi.deleteWorld(targetWorld.world_id, true);
      setWorldDeleteConflict(null);
      await finishWorldDeletion(targetWorld);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Невідома помилка';
      setSystemAlert(`Помилка видалення світу: ${message}`, 'error');
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
      onRequestDeleteWorld={(world) => {
        void handleRequestDeleteWorld(world);
      }}
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

        {/* ЛОГ ПОВІДОМЛЕНЬ + ІНДИКАТОР: Border.chatContainer (Row="1") */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <ChatContainer onNewCampaign={() => setIsNewCampaignModalOpen(true)} />
        </div>

        {/* ПОЛЕ ВВОДУ ТА ЕЛЕМЕНТИ (Row="2" Margin="0,16,0,0") */}
        <div className="mt-4 shrink-0">
          <ChatInput />
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

      {/* 8. ПІДТВЕРДЖЕННЯ КАСКАДНОГО ВИДАЛЕННЯ СВІТУ (409 Conflict) */}
      <ConfirmModal
        isOpen={!!worldDeleteConflict}
        onClose={() => setWorldDeleteConflict(null)}
        onConfirm={handleConfirmCascadeDeleteWorld}
        title="Видалити світ разом із героями?"
        message={`У світі «${worldDeleteConflict?.world.title || ''}» є ${worldDeleteConflict?.conflict.dependent_characters ?? 0} героїв та ${worldDeleteConflict?.conflict.dependent_campaigns ?? 0} кампаній. Видалити світ разом з усіма його героями та кампаніями?`}
        confirmText="Так, видалити все"
        cancelText="Ні, залишити"
        isLoading={isDeletingWorld}
      />

      {/* 9. ГЛОБАЛЬНЕ КОНТЕКСТНЕ МЕНЮ ПКМ ДЛЯ ВСІХ ІНПУТІВ, TEXTAREA ТА ЧАТІВ */}
      <GlobalContextMenu />
    </AppLayout>
  );
};

export default App;