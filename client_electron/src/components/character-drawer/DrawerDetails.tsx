import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ScrollText } from 'lucide-react';
import type { ParsedSheetSection } from '../../types/game';
import { DynamicSectionRenderer } from '../dynamic-sheet';

interface DrawerDetailsProps {
  sections: ParsedSheetSection[];
}

function hasSectionContent(section: ParsedSheetSection): boolean {
  const val = section.value;
  if (val === null || val === undefined) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') {
    return Object.values(val).some(
      (v) =>
        v !== null &&
        v !== undefined &&
        String(v).trim() !== '' &&
        (!Array.isArray(v) || v.length > 0)
    );
  }
  return String(val).trim().length > 0;
}

function formatSectionForDetailsRead(
  section: ParsedSheetSection,
  allSections: ParsedSheetSection[]
): ParsedSheetSection | null {
  if (section.path === 'meta.background') {
    const bioSection = allSections.find((s) => s.path === 'meta.biography');
    if (
      bioSection &&
      String(bioSection.value ?? '').trim() !== '' &&
      String(bioSection.value ?? '').trim() === String(section.value ?? '').trim()
    ) {
      return null;
    }
  }

  return section;
}

export const DrawerDetails: React.FC<DrawerDetailsProps> = ({ sections }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExpanded) return;
    const rafId = requestAnimationFrame(() => {
      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(rafId);
  }, [isExpanded]);

  const visibleSections = sections
    .filter(hasSectionContent)
    .map((sec) => formatSectionForDetailsRead(sec, sections))
    .filter((sec): sec is ParsedSheetSection => sec !== null);
  if (visibleSections.length === 0) return null;

  return (
    <div className="shrink-0 bg-[#141414] border border-[#262626] rounded-lg overflow-hidden transition-all duration-150 mt-1">
      {/* Заголовок спойлера */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2.5 text-left bg-transparent hover:bg-[#1A1A1A] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <ScrollText size={13} className="text-[#F59E0B] shrink-0" />
          <span className="text-[11px] font-bold text-[#F59E0B] tracking-[0.5px]">
            ДЕТАЛІ ПЕРСОНАЖА, РИСИ ТА СВІТ
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-[#F59E0B] transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`}
        />
      </button>

      {/* Вміст спойлера */}
      {isExpanded && (
        <div
          ref={contentRef}
          className="p-3 border-t border-[#222222] grid grid-cols-1 md:grid-cols-2 gap-2.5 animate-fade-in"
        >
          {visibleSections.map((section) => (
            <div
              key={section.path}
              className={
                section.archetype === 'long_text' && String(section.value ?? '').length > 80
                  ? 'md:col-span-2'
                  : ''
              }
            >
              <DynamicSectionRenderer
                section={section}
                mode="read"
                variant="compact"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
