import React from 'react';
import { User } from 'lucide-react';
import { DynamicLucideIcon } from '../dynamic-sheet';

interface HeroAvatarProps {
  avatar?: string | null;
  name?: string;
  iconSize?: number;
  iconClassName?: string;
  containerClassName?: string;
}

/**
 * Спільний рендерер аватара персонажа: data:image/* -> <img>, Lucide-ключ -> DynamicLucideIcon, інакше <User />.
 */
export const HeroAvatar: React.FC<HeroAvatarProps> = ({
  avatar,
  name = 'Герой',
  iconSize = 15,
  iconClassName = 'text-[#9CA3AF]',
  containerClassName = 'w-7 h-7 rounded-lg bg-[#222222] border border-[#2E2E2E]',
}) => {
  const cleanAvatar = typeof avatar === 'string' ? avatar.trim() : '';
  const isImageAvatar = cleanAvatar.startsWith('data:image/');

  return (
    <div
      className={`flex items-center justify-center shrink-0 overflow-hidden ${containerClassName}`}
    >
      {isImageAvatar ? (
        <img src={cleanAvatar} alt={name} className="w-full h-full object-cover" />
      ) : cleanAvatar ? (
        <DynamicLucideIcon
          icon={cleanAvatar}
          fallback={User}
          size={iconSize}
          className={iconClassName}
        />
      ) : (
        <User size={iconSize} className={iconClassName} />
      )}
    </div>
  );
};
