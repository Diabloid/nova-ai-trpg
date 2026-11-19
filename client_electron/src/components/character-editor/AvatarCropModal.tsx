import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crop, Loader2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { renderCroppedAvatarToWebP } from '../../utils/avatarUtils';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface AvatarCropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onApply: (croppedDataUri: string) => void;
}

const CROP_VIEW_SIZE = 264;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.12;

interface ImageSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeDisplayMetrics(nat: ImageSize | null, zoom: number) {
  if (!nat || nat.width <= 0 || nat.height <= 0) {
    return {
      baseScale: 1,
      totalScale: zoom,
      displayW: CROP_VIEW_SIZE * zoom,
      displayH: CROP_VIEW_SIZE * zoom,
    };
  }
  const baseScale = Math.max(CROP_VIEW_SIZE / nat.width, CROP_VIEW_SIZE / nat.height);
  const totalScale = baseScale * zoom;
  return {
    baseScale,
    totalScale,
    displayW: nat.width * totalScale,
    displayH: nat.height * totalScale,
  };
}

function clampPanOffset(
  x: number,
  y: number,
  zoom: number,
  nat: ImageSize | null
): { x: number; y: number } {
  const { displayW, displayH } = computeDisplayMetrics(nat, zoom);
  const maxOffsetX = Math.max(0, (displayW - CROP_VIEW_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayH - CROP_VIEW_SIZE) / 2);
  return {
    x: clamp(x, -maxOffsetX, maxOffsetX),
    y: clamp(y, -maxOffsetY, maxOffsetY),
  };
}

const AvatarCropContent: React.FC<{
  imageSrc: string;
  isApplying: boolean;
  setIsApplying: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
  onApply: (croppedDataUri: string) => void;
}> = ({ imageSrc, isApplying, setIsApplying, onClose, onApply }) => {
  const setSystemAlert = useGameStore((s) => s.setSystemAlert);

  const [naturalSize, setNaturalSize] = useState<ImageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(
    null
  );

  const applyZoom = useCallback(
    (nextZoomRaw: number) => {
      const nextZoom = Number(clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM).toFixed(3));
      setZoom(nextZoom);
      setOffset((prev) => clampPanOffset(prev.x, prev.y, nextZoom, naturalSize));
    },
    [naturalSize]
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      setZoom((prevZoom) => {
        const nextZoom = Number(
          clamp(prevZoom + direction * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM).toFixed(3)
        );
        setOffset((prevOffset) => clampPanOffset(prevOffset.x, prevOffset.y, nextZoom, naturalSize));
        return nextZoom;
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [naturalSize]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!naturalSize || isApplying) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || !e.currentTarget.hasPointerCapture(e.pointerId)) return;

    const dx = e.clientX - start.pointerX;
    const dy = e.clientY - start.pointerY;
    setOffset(clampPanOffset(start.originX + dx, start.originY + dy, zoom, naturalSize));
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const handleResetCenter = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const { totalScale, displayW, displayH } = computeDisplayMetrics(naturalSize, zoom);
  const clampedOffset = clampPanOffset(offset.x, offset.y, zoom, naturalSize);
  const imgLeft = (CROP_VIEW_SIZE - displayW) / 2 + clampedOffset.x;
  const imgTop = (CROP_VIEW_SIZE - displayH) / 2 + clampedOffset.y;

  const handleConfirmCrop = async () => {
    if (!naturalSize || isApplying) return;

    try {
      setIsApplying(true);
      const sx = clamp(-imgLeft / totalScale, 0, Math.max(0, naturalSize.width - 1));
      const sy = clamp(-imgTop / totalScale, 0, Math.max(0, naturalSize.height - 1));
      const sSize = clamp(
        CROP_VIEW_SIZE / totalScale,
        1,
        Math.min(naturalSize.width - sx, naturalSize.height - sy)
      );

      const croppedDataUri = await renderCroppedAvatarToWebP(
        imageSrc,
        { sx, sy, sSize },
        256,
        0.82
      );
      onApply(croppedDataUri);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не вдалося обрізати зображення';
      setSystemAlert(msg, 'error');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
      {/* Шапка */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[#9CA3AF] text-[11px] font-bold tracking-widest uppercase">
            <Crop size={12} className="text-[#60A5FA]" />
            <span>КАДРУВАННЯ ПОРТРЕТА</span>
          </div>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Перетягуйте фото мишкою та наближайте колесом або повзунком
          </p>
        </div>

        <button
          type="button"
          disabled={isApplying}
          onClick={onClose}
          aria-label="Закрити кадрування"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9CA3AF] border border-transparent enabled:hover:text-[#EF4444] enabled:hover:bg-[#2A1418] enabled:hover:border-[#7E0018]/60 enabled:cursor-pointer disabled:opacity-40 disabled:cursor-default transition-all shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {/* Інтерактивна рамка 264×264 */}
      <div className="flex flex-col items-center gap-3">
        <div
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          style={{ width: CROP_VIEW_SIZE, height: CROP_VIEW_SIZE }}
          className={`relative rounded-xl border-2 border-[#3A3A3A] bg-[#0B0B0B] overflow-hidden select-none touch-none shadow-inner ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {!naturalSize && (
            <div className="absolute inset-0 flex items-center justify-center text-[#6B7280]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          <img
            src={imageSrc}
            alt="Кадрування аватара"
            draggable={false}
            onLoad={(e) => {
              const nw = e.currentTarget.naturalWidth || e.currentTarget.width;
              const nh = e.currentTarget.naturalHeight || e.currentTarget.height;
              if (nw > 0 && nh > 0) {
                setNaturalSize({ width: nw, height: nh });
              }
            }}
            style={{
              width: displayW,
              height: displayH,
              left: imgLeft,
              top: imgTop,
            }}
            className="absolute max-w-none select-none pointer-events-none"
          />

          {/* Делікатна сітка третин для орієнтира */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-x-0 top-1/3 border-t border-white/15" />
            <div className="absolute inset-x-0 top-2/3 border-t border-white/15" />
            <div className="absolute inset-y-0 left-1/3 border-l border-white/15" />
            <div className="absolute inset-y-0 left-2/3 border-l border-white/15" />
            <div className="absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/15" />
          </div>
        </div>

        {/* Панель зуму та скидання центру */}
        <div className="w-full flex items-center gap-2 bg-[#121212] border border-[#262626] rounded-lg px-3 py-2">
          <button
            type="button"
            disabled={!naturalSize || isApplying || zoom <= MIN_ZOOM}
            onClick={() => applyZoom(zoom - ZOOM_STEP)}
            aria-label="Зменшити масштаб"
            className="w-6 h-6 rounded flex items-center justify-center text-[#9CA3AF] enabled:hover:text-white enabled:hover:bg-[#222222] enabled:cursor-pointer disabled:opacity-35 disabled:cursor-default transition-colors shrink-0"
          >
            <ZoomOut size={13} />
          </button>

          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!naturalSize || isApplying}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label="Масштаб зображення"
            className="flex-1 h-1.5 accent-[#7E0018] bg-[#262626] rounded-full cursor-pointer disabled:opacity-50"
          />

          <button
            type="button"
            disabled={!naturalSize || isApplying || zoom >= MAX_ZOOM}
            onClick={() => applyZoom(zoom + ZOOM_STEP)}
            aria-label="Збільшити масштаб"
            className="w-6 h-6 rounded flex items-center justify-center text-[#9CA3AF] enabled:hover:text-white enabled:hover:bg-[#222222] enabled:cursor-pointer disabled:opacity-35 disabled:cursor-default transition-colors shrink-0"
          >
            <ZoomIn size={13} />
          </button>

          <span className="text-[11px] font-mono text-[#D1D5DB] w-10 text-right shrink-0">
            {zoom.toFixed(1)}×
          </span>

          <button
            type="button"
            disabled={!naturalSize || isApplying || (zoom === 1 && offset.x === 0 && offset.y === 0)}
            onClick={handleResetCenter}
            aria-label="Скинути центр і масштаб"
            className="ml-1 px-2 py-1 rounded bg-[#1B1B1B] border border-[#2D2D2D] text-[11px] text-[#9CA3AF] inline-flex items-center gap-1 enabled:hover:text-white enabled:hover:border-[#444444] enabled:cursor-pointer disabled:opacity-35 disabled:cursor-default transition-colors shrink-0"
          >
            <RotateCcw size={11} />
            <span>Центр</span>
          </button>
        </div>
      </div>

      {/* Футер дій */}
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <Button
          type="button"
          variant="secondary"
          disabled={isApplying}
          onClick={onClose}
          className="w-full text-xs py-2"
        >
          Скасувати
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!naturalSize || isApplying}
          isLoading={isApplying}
          onClick={() => {
            void handleConfirmCrop();
          }}
          className="w-full text-xs py-2 font-semibold"
        >
          {isApplying ? 'Збереження...' : 'Застосувати'}
        </Button>
      </div>
    </>
  );
};

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onApply,
}) => {
  const [isApplying, setIsApplying] = useState(false);

  return (
    <Modal
      isOpen={isOpen && Boolean(imageSrc)}
      onClose={onClose}
      closeDisabled={isApplying}
      className="w-[420px] border-[#333333] gap-4"
    >
      {isOpen && imageSrc && (
        <AvatarCropContent
          key={imageSrc}
          imageSrc={imageSrc}
          isApplying={isApplying}
          setIsApplying={setIsApplying}
          onClose={onClose}
          onApply={onApply}
        />
      )}
    </Modal>
  );
};
