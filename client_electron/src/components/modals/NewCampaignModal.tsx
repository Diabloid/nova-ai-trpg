import React, { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { Button } from '../ui/Button';

interface NewCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewCampaignModal: React.FC<NewCampaignModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { createCampaign, activeCharacter } = useGameStore();
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;

    try {
      setIsCreating(true);
      const campTitle = title.trim() || (activeCharacter ? `Пригода ${activeCharacter.meta.name}` : undefined);
      await createCampaign(campTitle);
      setTitle('');
      onClose();
    } catch {
      // Error handled in store
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-[380px] max-w-full bg-[#161616] border border-[#333333] rounded-xl p-6 shadow-2xl flex flex-col gap-3.5 text-[#E5E7EB]">
        <div>
          <div className="text-[#9CA3AF] text-[11px] font-bold tracking-widest uppercase">
            НОВА КАМПАНІЯ
          </div>
          <h2 className="text-[#F3F4F6] text-base font-bold mt-1">
            Створення нового ігрового забігу
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 mt-1">
          <div className="space-y-1">
            <label className="block text-xs text-[#9CA3AF]">Назва пригоди:</label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Наприклад: Дослідження занедбаної каплиці"
              className="w-full bg-[#161616] text-[#E5E7EB] text-sm rounded-lg px-3 py-2 border border-[#333333] placeholder-[#555555] focus:outline-none focus:border-[#7E0018] focus:ring-1 focus:ring-[#7E0018] transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isCreating}
              className="w-full justify-center text-xs py-2 cursor-pointer"
            >
              Скасувати
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isCreating}
              className="w-full justify-center text-xs py-2 cursor-pointer font-semibold"
            >
              {isCreating ? 'Створення...' : 'Підтвердити'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};