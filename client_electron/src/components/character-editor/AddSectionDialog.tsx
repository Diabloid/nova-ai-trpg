import React, { useMemo, useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import type { TemplateArchetype, TemplatePlacement } from '../../types/api';
import { toAsciiSlug, type AddSectionInput } from '../../utils/schemaMergeUtils';
import { Button } from '../ui/Button';
import { ColorPickerPopover } from '../ui/ColorPickerPopover';
import { CustomSelect, type CustomSelectOption } from '../ui/CustomSelect';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { IconPicker } from './IconPicker';

interface AddSectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (input: AddSectionInput) => void;
}

const ARCHETYPE_OPTIONS: CustomSelectOption[] = [
  { value: 'stat_grid', label: 'Сітка параметрів', sublabel: 'stat_grid' },
  { value: 'card_list', label: 'Список карток', sublabel: 'card_list' },
  { value: 'container_map', label: 'Контейнери / інвентар', sublabel: 'container_map' },
  { value: 'tag_list', label: 'Теги / чіпси', sublabel: 'tag_list' },
  { value: 'long_text', label: 'Довгий текст', sublabel: 'long_text' },
];

const PLACEMENT_OPTIONS: CustomSelectOption[] = [
  { value: 'drawer_column', label: 'Колонка шторки', sublabel: 'drawer_column' },
  { value: 'details', label: 'Спойлер деталей', sublabel: 'details' },
  { value: 'header_badge', label: 'Бейдж у шапці', sublabel: 'header_badge' },
];

const PRESET_COLORS = [
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#34D399',
  '#38BDF8',
  '#60A5FA',
  '#A78BFA',
  '#C084FC',
  '#9CA3AF',
];

const AddSectionForm: React.FC<{
  onClose: () => void;
  onAdd: (input: AddSectionInput) => void;
}> = ({ onClose, onAdd }) => {
  const [title, setTitle] = useState('');
  const [archetype, setArchetype] = useState<TemplateArchetype>('stat_grid');
  const [placement, setPlacement] = useState<TemplatePlacement>('drawer_column');
  const [icon, setIcon] = useState('sparkles');
  const [color, setColor] = useState('#38BDF8');

  const previewPath = useMemo(() => {
    const slug = toAsciiSlug(title, 'custom_section');
    return placement === 'details' ? `custom_blocks.${slug}` : slug;
  }, [title, placement]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      archetype,
      placement,
      icon,
      color,
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2 text-text-bright">
        <Layers size={16} className="text-accent-violet shrink-0" />
        <h3 className="text-sm font-bold tracking-wide uppercase">
          Додати нову секцію
        </h3>
      </div>

      {/* Назва секції */}
      <div className="space-y-1">
        <label className="block text-xs text-text-muted">Назва секції:</label>
        <Input
          type="text"
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Наприклад: Шкала Радіації або Тайні титули"
          className="px-3 py-2 text-xs"
        />
        <div className="text-[10px] text-text-dim font-mono truncate">
          Шлях у JSON: <span className="text-text-muted">{previewPath}</span>
        </div>
      </div>

      {/* Архетип і розміщення через CustomSelect */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label className="block text-xs text-text-muted">Тип (архетип):</label>
          <CustomSelect
            value={archetype}
            options={ARCHETYPE_OPTIONS}
            onChange={(val) => setArchetype(val as TemplateArchetype)}
            ariaLabel="Оберіть архетип секції"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-text-muted">Місце виводу:</label>
          <CustomSelect
            value={placement}
            options={PLACEMENT_OPTIONS}
            onChange={(val) => setPlacement(val as TemplatePlacement)}
            ariaLabel="Оберіть місце розміщення секції"
          />
        </div>
      </div>

      {/* Іконка та акцентний колір */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-start">
        <div className="space-y-1">
          <label className="block text-xs text-text-muted">Векторна іконка:</label>
          <IconPicker value={icon} onChange={setIcon} accentColor={color} />
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-text-muted">Акцентний колір:</label>
          <div className="flex flex-wrap items-center gap-1.5 min-h-[34px] bg-bg-app border border-border-strong rounded-[8px] px-2 py-1">
            {PRESET_COLORS.map((presetHex) => {
              const isSelected = color.toLowerCase() === presetHex.toLowerCase();
              return (
                <button
                  key={presetHex}
                  type="button"
                  data-tooltip={presetHex}
                  onClick={() => setColor(presetHex)}
                  className={`w-4 h-4 rounded-full transition-transform enabled:cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-white scale-110'
                      : 'opacity-80 enabled:hover:opacity-100 enabled:hover:scale-110'
                  }`}
                  style={{ backgroundColor: presetHex }}
                />
              );
            })}
            <ColorPickerPopover
              value={color}
              variant="swatch"
              ariaLabel="Довільний акцентний колір секції"
              onChange={(hex) => setColor(hex)}
              className="ml-auto"
            />
          </div>
        </div>
      </div>

      {/* Дії */}
      <div className="grid grid-cols-2 gap-2.5 pt-2">
        <Button type="button" variant="secondary" onClick={onClose} className="w-full text-xs py-2">
          Скасувати
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!title.trim()}
          className="w-full text-xs py-2 font-semibold"
        >
          <Plus size={13} />
          <span>Додати секцію</span>
        </Button>
      </div>
    </form>
  );
};

export const AddSectionDialog: React.FC<AddSectionDialogProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="w-[460px] border-border-input gap-0">
      {isOpen && <AddSectionForm onClose={onClose} onAdd={onAdd} />}
    </Modal>
  );
};
