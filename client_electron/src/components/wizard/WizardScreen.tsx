import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useWizardStore } from '../../store/useWizardStore';
import { LivePreview } from './LivePreview';
import { WizardChat } from './WizardChat';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../modals/ConfirmModal';

export const WizardScreen: React.FC = () => {
  const { isWizardOpen, closeWizard, wizardMessages, wizardDraft, wizardInput } = useWizardStore();
  const [isConfirmCancelOpen, setIsConfirmCancelOpen] = useState(false);

  if (!isWizardOpen) return null;

  const handleCancel = () => {
    // Якщо користувач вже щось написав або є історія діалогу — відкриваємо фірмову модалку
    const hasUnsavedProgress =
      wizardMessages.length > 1 ||
      !!wizardDraft.charName ||
      !!wizardDraft.charTitles ||
      !!wizardDraft.charAge ||
      !!wizardDraft.charBackground ||
      !!wizardDraft.charAppearance ||
      !!wizardDraft.biography ||
      (wizardDraft.abilities?.length ?? 0) > 0 ||
      (wizardDraft.injuries?.length ?? 0) > 0 ||
      (wizardDraft.equipment?.length ?? 0) > 0 ||
      Object.keys(wizardDraft.customBlocks || {}).length > 0 ||
      !!wizardInput.trim();

    if (hasUnsavedProgress) {
      setIsConfirmCancelOpen(true);
    } else {
      closeWizard();
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-[#121212] flex flex-col pl-[46px] pr-8 py-6 select-none animate-in fade-in duration-200">
      {/* 1. Верхня панель екрану створення */}
      <div className="flex items-center justify-between pb-4 border-b border-[#222222] mb-4">
        <div className="space-y-1">
          <h1 className="text-base font-bold text-[#F3F4F6] tracking-wide">
            ТВОРЕЦЬ ДОЛІ: СТВОРЕННЯ ПЕРСОНАЖА
          </h1>
          <p className="text-xs text-[#9CA3AF]">
            Опишіть свого героя у вільній формі. Штучний інтелект допоможе викувати характер, походження та здібності.
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={handleCancel}
          className="text-xs px-3 py-1.5 text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#201014] border-[#333333] hover:border-[#7E0018] cursor-pointer transition-colors"
        >
          <X size={13} />
          <span>Скасувати</span>
        </Button>
      </div>

      {/* 2. Центральна частина: Спліт Прев'ю ліворуч (340px) + Чат праворуч (flex-1) */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        <LivePreview />
        <WizardChat />
      </div>

      {/* 3. Фірмове модальне вікно підтвердження скасування створення */}
      <ConfirmModal
        isOpen={isConfirmCancelOpen}
        onClose={() => setIsConfirmCancelOpen(false)}
        onConfirm={() => {
          setIsConfirmCancelOpen(false);
          closeWizard();
        }}
        title="ПЕРЕРВАТИ СТВОРЕННЯ?"
        message="Ви впевнені, що бажаєте перервати створення персонажа? Увесь прогрес чернетки буде втрачено."
        confirmText="Так, вийти"
        cancelText="Ні, продовжити"
      />
    </div>
  );
};