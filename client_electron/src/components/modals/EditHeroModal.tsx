import React, { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { PlayerState } from '../../types/api';

interface EditHeroModalProps {
  isOpen: boolean;
  onClose: () => void;
  charId?: string | null;
}

interface EditHeroFormProps {
  charId: string;
  initialName: string;
  initialBackground: string;
  initialAppearance: string;
  activeCharacter: PlayerState | null;
  onClose: () => void;
  onSave: (charId: string, updatedState: PlayerState) => Promise<void>;
}

const EditHeroForm: React.FC<EditHeroFormProps> = ({
  charId,
  initialName,
  initialBackground,
  initialAppearance,
  activeCharacter,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(initialName);
  const [background, setBackground] = useState(initialBackground);
  const [appearance, setAppearance] = useState(initialAppearance);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;

    try {
      setIsSaving(true);
      const baseState: PlayerState = activeCharacter || {
        meta: { name: '' },
        anatomy_and_health: { overall_state: 'Стан стабільний', injuries: [] },
        storage_and_equipment: { worn: [], containers: {} },
        abilities: [],
      };

      const updatedState: PlayerState = {
        ...baseState,
        meta: {
          ...baseState.meta,
          name: name.trim(),
          background: background.trim(),
          appearance: appearance.trim(),
        },
      };

      await onSave(charId, updatedState);
      onClose();
    } catch {
      // Error handled in store alert
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div className="space-y-1">
        <label className="block text-xs text-[#9CA3AF]">Ім'я персонажа:</label>
        <input
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Наприклад: Айвен"
          className="w-full bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3 py-2 border border-[#333333] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] transition-all"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs text-[#9CA3AF]">Архетип / Біографія:</label>
        <textarea
          rows={2}
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          placeholder="Наприклад: Найманець, маг вогню 3-го кола"
          className="w-full bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3 py-2 border border-[#333333] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] transition-all resize-y min-h-[56px] max-h-[120px]"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs text-[#9CA3AF]">Зовнішність:</label>
        <textarea
          rows={2}
          value={appearance}
          onChange={(e) => setAppearance(e.target.value)}
          placeholder="Наприклад: 22-річний юнак з рудим волоссям"
          className="w-full bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3 py-2 border border-[#333333] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] transition-all resize-y min-h-[56px] max-h-[120px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={isSaving}
          className="w-full justify-center text-xs py-2 cursor-pointer"
        >
          Скасувати
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!name.trim() || isSaving}
          className="w-full justify-center text-xs py-2 cursor-pointer font-semibold"
        >
          {isSaving ? 'Збереження...' : 'Зберегти'}
        </Button>
      </div>
    </form>
  );
};

export const EditHeroModal: React.FC<EditHeroModalProps> = ({
  isOpen,
  onClose,
  charId,
}) => {
  const { characters, activeCharacter, updateCharacter } = useGameStore();

  const targetChar = characters.find((c) => c.char_id === charId);
  const meta = activeCharacter?.meta;

  const initialName = meta?.name || targetChar?.name || '';
  const initialBackground = meta?.background || targetChar?.background || '';
  const initialAppearance = meta?.appearance || targetChar?.appearance || '';

  return (
    <Modal
      isOpen={isOpen && !!charId}
      onClose={onClose}
      className="w-[420px] border-[#333333] gap-4"
    >
      <div className="text-[#9CA3AF] text-[11px] font-bold tracking-widest uppercase">
        ЗАГОТОВКА ГЕРОЯ
      </div>

      {charId && (
        <EditHeroForm
          key={charId}
          charId={charId}
          initialName={initialName}
          initialBackground={initialBackground}
          initialAppearance={initialAppearance}
          activeCharacter={activeCharacter}
          onClose={onClose}
          onSave={updateCharacter}
        />
      )}
    </Modal>
  );
};