import React, { useRef } from 'react';
import { AlertCircle, Crop, ImagePlus, Loader2, RotateCcw } from 'lucide-react';
import { HeroAvatar } from '../ui/HeroAvatar';
import { Input } from '../ui/Input';
import { IconPicker } from '../ui/IconPicker';

export interface CharacterHeaderAnchors {
  name: string;
  location: string;
  overallState?: string;
  avatar?: string;
}

interface CharacterHeaderEditorProps {
  anchors: CharacterHeaderAnchors;
  isBusy: boolean;
  isCompressingAvatar: boolean;
  isNameValid: boolean;
  worldLabel: string;
  sectionsCount: number;
  onHeaderPatch: (patch: Partial<CharacterHeaderAnchors>) => void;
  onAvatarFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenAvatarCrop: () => void;
  onClearOriginalAvatarSrc: () => void;
}

/**
 * Секція редагування аватара (фото/іконка/кадрування) та базових якорів шапки героя.
 */
export const CharacterHeaderEditor: React.FC<CharacterHeaderEditorProps> = ({
  anchors,
  isBusy,
  isCompressingAvatar,
  isNameValid,
  worldLabel,
  sectionsCount,
  onHeaderPatch,
  onAvatarFileSelected,
  onOpenAvatarCrop,
  onClearOriginalAvatarSrc,
}) => {
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isImageAvatar =
    typeof anchors.avatar === 'string' && anchors.avatar.trim().startsWith('data:image/');

  const currentAvatarIcon =
    anchors.avatar && !anchors.avatar.startsWith('data:image/')
      ? anchors.avatar
      : 'user';

  return (
    <div className="shrink-0 bg-bg-card border border-border-default rounded-xl p-4 flex flex-col sm:flex-row gap-4">
      {/* Ліва колонка: прев'ю + керування аватаром */}
      <div className="flex sm:flex-col items-center gap-3 shrink-0 sm:w-[176px]">
        {isImageAvatar ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={onOpenAvatarCrop}
            aria-label="Кадрувати аватар"
            className="group relative rounded-xl outline-none enabled:cursor-pointer disabled:cursor-default shrink-0"
          >
            <HeroAvatar
              avatar={anchors.avatar}
              name={anchors.name || 'Герой'}
              iconSize={28}
              iconClassName="text-text-muted"
              containerClassName="w-[76px] h-[76px] rounded-xl bg-bg-deep border-2 border-border-compact-hover group-enabled:group-hover:border-accent-ruby shadow-inner transition-colors"
            />
            <div className="absolute inset-0 rounded-xl bg-black/65 opacity-0 group-enabled:group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5 text-white pointer-events-none">
              <Crop size={14} className="text-[#60A5FA]" />
              <span className="text-[10px] font-medium tracking-wide">Кадрувати</span>
            </div>
          </button>
        ) : (
          <HeroAvatar
            avatar={anchors.avatar}
            name={anchors.name || 'Герой'}
            iconSize={28}
            iconClassName="text-text-muted"
            containerClassName="w-[76px] h-[76px] rounded-xl bg-bg-deep border-2 border-border-compact-hover shadow-inner"
          />
        )}

        <div className="flex flex-col gap-1.5 w-full">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => avatarInputRef.current?.click()}
            className="h-[32px] w-full px-2.5 rounded-[7px] bg-[#1B1B1B] border border-border-frame text-[11px] font-medium text-text-primary inline-flex items-center justify-center gap-1.5 transition-all enabled:hover:bg-bg-hover enabled:hover:border-border-focus enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {isCompressingAvatar ? (
              <Loader2 size={12} className="animate-spin shrink-0" />
            ) : (
              <ImagePlus size={12} className="text-[#60A5FA] shrink-0" />
            )}
            <span>Завантажити фото</span>
          </button>

          <IconPicker
            value={currentAvatarIcon}
            onChange={(iconKey) => {
              onClearOriginalAvatarSrc();
              onHeaderPatch({ avatar: iconKey });
            }}
            label="Обрати іконку"
            disabled={isBusy}
          />

          <button
            type="button"
            disabled={isBusy || !anchors.avatar}
            onClick={() => {
              onClearOriginalAvatarSrc();
              onHeaderPatch({ avatar: '' });
            }}
            className="h-[30px] w-full px-2.5 rounded-[7px] bg-bg-panel border border-border-default text-[11px] font-medium text-text-muted inline-flex items-center justify-center gap-1.5 transition-all enabled:hover:text-danger enabled:hover:bg-accent-ruby-soft enabled:hover:border-accent-ruby/60 enabled:active:scale-[0.98] enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <RotateCcw size={11} className="shrink-0" />
            <span>Скинути</span>
          </button>

          <input
            ref={avatarInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            onChange={onAvatarFileSelected}
            className="hidden"
          />
        </div>
      </div>

      {/* Права колонка: Ім'я, Локація, Загальний стан */}
      <div className="flex-1 min-w-0 grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <label className="block text-xs text-text-muted">
            Ім&apos;я персонажа: <span className="text-danger">*</span>
          </label>
          <Input
            type="text"
            value={anchors.name}
            onChange={(e) => onHeaderPatch({ name: e.target.value })}
            placeholder="Введіть ім'я героя..."
            className="px-3 py-2 text-xs"
          />
          <div
            className={`grid transition-all duration-200 ease-out ${
              !isNameValid
                ? 'grid-rows-[1fr] opacity-100'
                : 'grid-rows-[0fr] opacity-0 -mt-1 pointer-events-none'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex items-center gap-1 text-[11px] text-danger">
                <AlertCircle size={11} className="shrink-0" />
                <span>Ім&apos;я персонажа не може бути порожнім</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs text-text-muted">Поточна локація:</label>
            <Input
              type="text"
              value={anchors.location}
              onChange={(e) => onHeaderPatch({ location: e.target.value })}
              placeholder="Наприклад: Таверна на краю лісу"
              className="px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-text-muted">Загальний стан:</label>
            <Input
              type="text"
              value={anchors.overallState ?? ''}
              onChange={(e) => onHeaderPatch({ overallState: e.target.value })}
              placeholder="Наприклад: Повний сил / Виснажений"
              className="px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-2 pt-0.5">
          <span className="inline-flex items-center gap-1">
            <span>Світ:</span>
            <strong className="font-semibold text-text-primary">{worldLabel}</strong>
          </span>
          <span className="text-[#4B5563]">•</span>
          <span className="inline-flex items-center gap-1">
            <span>Секцій у листі:</span>
            <strong className="font-semibold text-text-primary">{sectionsCount}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
