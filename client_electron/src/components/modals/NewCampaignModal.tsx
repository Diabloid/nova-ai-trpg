import React, { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={isCreating}
      className="w-[380px] border-border-input gap-3.5"
    >
      <div>
        <div className="text-text-muted text-[11px] font-bold tracking-widest uppercase">
          НОВА КАМПАНІЯ
        </div>
        <h2 className="text-text-bright text-base font-bold mt-1">
          Створення нового ігрового забігу
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 mt-1">
        <div className="space-y-1">
          <label className="block text-xs text-text-muted">Назва пригоди:</label>
          <Input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Наприклад: Дослідження занедбаної каплиці"
            className="px-3 py-2"
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
    </Modal>
  );
};