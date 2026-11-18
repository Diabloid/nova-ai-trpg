import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { worldsApi } from '../../api/worldsApi';
import { useGameStore } from '../../store/useGameStore';
import type { WorldSummary } from '../../types/api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface CloneWorldModalProps {
  isOpen: boolean;
  sourceWorld: WorldSummary | null;
  onClose: () => void;
  onCloned?: (createdWorld: WorldSummary) => void;
}

interface CloneWorldFormProps {
  sourceWorld: WorldSummary;
  isCloning: boolean;
  setIsCloning: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
  onCloned?: (createdWorld: WorldSummary) => void;
}

const CloneWorldForm: React.FC<CloneWorldFormProps> = ({
  sourceWorld,
  isCloning,
  setIsCloning,
  onClose,
  onCloned,
}) => {
  const { selectWorld, loadWorlds, setSystemAlert } = useGameStore();
  const [newTitle, setNewTitle] = useState(`${sourceWorld.title} (Копія)`);
  const [includeLore, setIncludeLore] = useState(true);

  const trimmedTitle = newTitle.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedTitle || isCloning) return;

    try {
      setIsCloning(true);
      const created = await worldsApi.cloneWorld(sourceWorld.world_id, {
        new_title: trimmedTitle,
        include_lore: includeLore,
      });
      await selectWorld(created.world_id);
      await loadWorlds();
      setSystemAlert(
        `Світ «${created.title}» успішно створено на базі «${sourceWorld.title}»`,
        'success'
      );
      onCloned?.(created);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Невідома помилка';
      setSystemAlert(`Не вдалося клонувати світ: ${message}`, 'error');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 mt-1">
      <div className="space-y-1.5">
        <label className="block text-xs text-[#9CA3AF]">Назва нового світу:</label>
        <input
          type="text"
          autoFocus
          value={newTitle}
          disabled={isCloning}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Наприклад: Хроніки Уессексу"
          className="w-full bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3 py-2 border border-[#333333] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] transition-all disabled:opacity-60"
        />
      </div>

      <button
        type="button"
        role="checkbox"
        aria-checked={includeLore}
        disabled={isCloning}
        onClick={() => setIncludeLore((prev) => !prev)}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#161616] border border-[#2A2A2A] text-left transition-colors enabled:hover:border-[#3A3A3A] enabled:hover:bg-[#1B1B1B] enabled:cursor-pointer disabled:opacity-60 disabled:cursor-default"
      >
        <span
          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
            includeLore
              ? 'bg-[#7E0018] border-[#9E0020] text-white'
              : 'bg-[#121212] border-[#404040] text-transparent'
          }`}
        >
          <Check size={11} strokeWidth={3} />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-[#E5E7EB]">
            Копіювати базу лору
          </span>
          <span className="text-[11px] text-[#6B7280] leading-snug">
            Перенести всі поточні статті лору до нового всесвіту
          </span>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={isCloning}
          className="w-full justify-center text-xs py-2 font-medium"
        >
          Скасувати
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!trimmedTitle || isCloning}
          isLoading={isCloning}
          className="w-full justify-center text-xs py-2 font-semibold"
        >
          {isCloning ? 'Клонування...' : 'Клонувати світ'}
        </Button>
      </div>
    </form>
  );
};

export const CloneWorldModal: React.FC<CloneWorldModalProps> = ({
  isOpen,
  sourceWorld,
  onClose,
  onCloned,
}) => {
  const [isCloning, setIsCloning] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={isCloning}
      className="w-[400px] border-[#333333] gap-3.5"
    >
      <div>
        <div className="flex items-center gap-1.5 text-[#9CA3AF] text-[11px] font-bold tracking-widest uppercase">
          <Copy size={12} className="text-[#93C5FD]" />
          <span>КЛОНУВАННЯ СВІТУ</span>
        </div>
        <h2 className="text-[#F3F4F6] text-base font-bold mt-1 break-words">
          Новий світ на базі «{sourceWorld?.title || ''}»
        </h2>
      </div>

      {sourceWorld && (
        <CloneWorldForm
          key={`${isOpen ? 'open' : 'closed'}-${sourceWorld.world_id}`}
          sourceWorld={sourceWorld}
          isCloning={isCloning}
          setIsCloning={setIsCloning}
          onClose={onClose}
          onCloned={onCloned}
        />
      )}
    </Modal>
  );
};
