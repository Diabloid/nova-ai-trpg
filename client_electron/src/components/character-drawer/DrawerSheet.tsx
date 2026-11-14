import React from 'react';
import { useGameStore } from '../../store/useGameStore';
import { InjuriesCol } from './InjuriesCol';
import { WornCol } from './WornCol';
import { AbilitiesCol } from './AbilitiesCol';
import { ContainersCol } from './ContainersCol';
import { DrawerDetails } from './DrawerDetails';

export const DrawerSheet: React.FC = () => {
  const { playerState, activeCharacter, isCharacterDrawerOpen } = useGameStore();
  const state = playerState || activeCharacter;

  if (!isCharacterDrawerOpen) return null;

  const injuries = state?.anatomy_and_health?.injuries || [];
  const worn = state?.storage_and_equipment?.worn || [];
  const abilities = state?.abilities || [];
  const containers = state?.storage_and_equipment?.containers || {};
  const meta = state?.meta;
  const customBlocks = state?.custom_blocks || {};

  return (
    <div className="w-full bg-[#181818] border border-[#2A2A2A] rounded-[10px] p-[16px_16px_8px_16px] mt-1 flex flex-col gap-2.5 shadow-2xl animate-fade-in max-h-[460px] overflow-y-auto">
      {/* 4-колонкова сітка: 0.8fr, 0.85fr, 1.1fr, 1.25fr */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[0.8fr_0.85fr_1.1fr_1.25fr] gap-2.5">
        <InjuriesCol injuries={injuries} />
        <WornCol worn={worn} />
        <AbilitiesCol abilities={abilities} />
        <ContainersCol containers={containers} />
      </div>

      {/* Нижній розгортний спойлер деталей персонажа (ДЕТАЛІ ПЕРСОНАЖА, РИСИ ТА СВІТ) */}
      <DrawerDetails meta={meta} customBlocks={customBlocks} />
    </div>
  );
};
