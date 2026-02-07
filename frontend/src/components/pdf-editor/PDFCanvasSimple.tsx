'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FormField, DetectedField, FontFamily } from './types';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface PDFCanvasSimpleProps {
  imageUrl: string;
  detectedFields: DetectedField[];
  fields: FormField[];
  fontSize: number;
  fontFamily: FontFamily;
  onFieldsChange: (fields: FormField[]) => void;
  onFontSizeChange?: (size: number) => void;
  onFontFamilyChange?: (family: FontFamily) => void;
  className?: string;
}

export function PDFCanvasSimple({
  imageUrl,
  detectedFields,
  fields,
  fontSize,
  fontFamily,
  onFieldsChange,
  onFontSizeChange,
  onFontFamilyChange,
  className,
}: PDFCanvasSimpleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Load image
  useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      setImage(img);
      setImageError(null);
    };
    
    img.onerror = () => {
      setImageError('Failed to load image');
      setImage(null);
    };
    
    img.src = imageUrl;
  }, [imageUrl]);

  // Convert detected fields to FormField format
  useEffect(() => {
    if (detectedFields.length > 0 && fields.length === 0) {
      const initialFields: FormField[] = detectedFields.map((field, index) => ({
        id: `field-${index}-${Date.now()}`,
        type: field.type,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        label: field.label,
        value: '',
        checked: false,
        // Don't store fontSize/fontFamily per field - use global values
      }));
      onFieldsChange(initialFields);
    }
  }, [detectedFields, fields.length, fontSize, fontFamily, onFieldsChange]);

  // Focus input when editing starts and update font size when fontSize changes
  useEffect(() => {
    if (editingFieldId && inputRef.current) {
      inputRef.current.focus();
      // Position cursor at end of text
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        const length = inputRef.current.value.length;
        inputRef.current.setSelectionRange(length, length);
      }
    }
  }, [editingFieldId, fontSize]); // Re-run when fontSize changes to update input style

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = image.width;
    canvas.height = image.height;

    // Draw image
    ctx.drawImage(image, 0, 0);

    // Draw fields
    fields.forEach((field) => {
      const isEditing = field.id === editingFieldId;
      const isHovered = field.id === hoveredFieldId;
      const isDragging = field.id === draggingFieldId;

      // Don't draw field border when editing (input overlay will show it)
      if (!isEditing) {
        // Field background
        ctx.fillStyle = isHovered
          ? 'rgba(59, 130, 246, 0.1)'
          : 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(field.x, field.y, field.width, field.height);

        // Field border
        const borderColor = field.type === 'checkbox' ? '#ef4444' : '#22c55e';
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.setLineDash(isDragging ? [5, 5] : []);
        ctx.strokeRect(field.x, field.y, field.width, field.height);
        ctx.setLineDash([]);
      }

      // Field content (only show when not editing)
      if (!isEditing) {
        if (field.type === 'text' && field.value) {
          ctx.fillStyle = '#000';
          // Use global fontSize and fontFamily (apply to all fields)
          ctx.font = `${fontSize}px "${fontFamily}", sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          const textY = field.y + field.height / 2;
          // Tab space padding from left (8px)
          const tabPadding = 8;
          ctx.fillText(
            field.value,
            field.x + tabPadding,
            textY
          );
        } else if (field.type === 'checkbox') {
          const checkboxSize = Math.min(field.height - 8, field.width - 8);
          const checkboxX = field.x + 4;
          const checkboxY = field.y + 4;

          // Checkbox border
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.strokeRect(checkboxX, checkboxY, checkboxSize, checkboxSize);

          // Checkbox fill
          if (field.checked) {
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(checkboxX, checkboxY, checkboxSize, checkboxSize);

            // Checkmark
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(checkboxX + checkboxSize * 0.2, checkboxY + checkboxSize * 0.5);
            ctx.lineTo(checkboxX + checkboxSize * 0.45, checkboxY + checkboxSize * 0.75);
            ctx.lineTo(checkboxX + checkboxSize * 0.8, checkboxY + checkboxSize * 0.3);
            ctx.stroke();
          }
        } else if (field.type === 'signature' && !field.value) {
          ctx.fillStyle = '#9ca3af';
          ctx.font = 'italic 12px Arial';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            'Signature',
            field.x + 4,
            field.y + field.height / 2
          );
        }
      }

      // Delete button on hover
      if (isHovered && !isEditing && !isDragging && field.type !== 'checkbox') {
        const deleteBtnSize = 16;
        const deleteBtnX = field.x + field.width - deleteBtnSize - 4;
        const deleteBtnY = field.y + 4;
        
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(deleteBtnX + deleteBtnSize / 2, deleteBtnY + deleteBtnSize / 2, deleteBtnSize / 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×', deleteBtnX + deleteBtnSize / 2, deleteBtnY + deleteBtnSize / 2);
      }
    });
  }, [image, fields, editingFieldId, hoveredFieldId, draggingFieldId, fontSize, fontFamily]);

  // Redraw when dependencies change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Get canvas position and scale relative to viewport
  const getCanvasPosition = useCallback(() => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvas = canvasRef.current;
    return {
      left: rect.left,
      top: rect.top,
      scaleX: canvas.width / rect.width,
      scaleY: canvas.height / rect.height,
    };
  }, []);

  // Update canvas position on scroll/resize
  const [canvasPosition, setCanvasPosition] = useState<{
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      const pos = getCanvasPosition();
      setCanvasPosition(pos);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [getCanvasPosition, image]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !image || draggingFieldId) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if clicking delete button
    const clickedField = fields.find(
      (field) =>
        x >= field.x &&
        x <= field.x + field.width &&
        y >= field.y &&
        y <= field.y + field.height
    );

    if (clickedField && hoveredFieldId === clickedField.id && clickedField.type !== 'checkbox') {
      const deleteBtnSize = 16;
      const deleteBtnX = clickedField.x + clickedField.width - deleteBtnSize - 4;
      const deleteBtnY = clickedField.y + 4;
      const deleteBtnCenterX = deleteBtnX + deleteBtnSize / 2;
      const deleteBtnCenterY = deleteBtnY + deleteBtnSize / 2;
      
      const distance = Math.sqrt(
        Math.pow(x - deleteBtnCenterX, 2) + Math.pow(y - deleteBtnCenterY, 2)
      );
      
      if (distance <= deleteBtnSize / 2) {
        // Delete field
        onFieldsChange(fields.filter((f) => f.id !== clickedField.id));
        setEditingFieldId(null);
        return;
      }
    }

    // Handle checkbox toggle
    if (clickedField && clickedField.type === 'checkbox') {
      onFieldsChange(
        fields.map((f) =>
          f.id === clickedField.id ? { ...f, checked: !f.checked } : f
        )
      );
      return;
    }

    // Start editing text field
    if (clickedField && clickedField.type === 'text') {
      setEditingFieldId(clickedField.id);
    } else {
      setEditingFieldId(null);
    }
  }, [fields, hoveredFieldId, image, draggingFieldId, onFieldsChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (draggingFieldId && dragStart) {
      // Handle dragging
      onFieldsChange(
        fields.map((field) =>
          field.id === draggingFieldId
            ? { ...field, x: Math.max(0, x - dragStart.x), y: Math.max(0, y - dragStart.y) }
            : field
        )
      );
    } else {
      // Handle hover
      const hoveredField = fields.find(
        (field) =>
          x >= field.x &&
          x <= field.x + field.width &&
          y >= field.y &&
          y <= field.y + field.height
      );
      setHoveredFieldId(hoveredField?.id || null);
    }
  }, [fields, draggingFieldId, dragStart, image, onFieldsChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !image || editingFieldId) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Find field being dragged
    const draggedField = fields.find(
      (field) =>
        x >= field.x &&
        x <= field.x + field.width &&
        y >= field.y &&
        y <= field.y + field.height
    );

    if (draggedField && draggedField.type !== 'checkbox') {
      setDraggingFieldId(draggedField.id);
      setDragStart({ x: x - draggedField.x, y: y - draggedField.y });
    }
  }, [fields, image, editingFieldId]);

  const handleMouseUp = useCallback(() => {
    setDraggingFieldId(null);
    setDragStart(null);
  }, []);

  const handleInputChange = useCallback((value: string) => {
    if (!editingFieldId) return;
    
    onFieldsChange(
      fields.map((field) =>
        field.id === editingFieldId ? { ...field, value } : field
      )
    );
  }, [editingFieldId, fields, onFieldsChange]);

  const handleInputBlur = useCallback(() => {
    // Just finish editing, don't update field properties (they use global values)
    setEditingFieldId(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingFieldId(null);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Finish editing on Enter (Shift+Enter for new line)
      setEditingFieldId(null);
    } else if (e.key === 'Tab' && editingFieldId) {
      // Tab navigation: move to next text field
      e.preventDefault();
      const textFields = fields.filter(f => f.type === 'text');
      const currentIndex = textFields.findIndex(f => f.id === editingFieldId);
      
      if (currentIndex !== -1) {
        const nextIndex = e.shiftKey 
          ? (currentIndex - 1 + textFields.length) % textFields.length // Shift+Tab: previous
          : (currentIndex + 1) % textFields.length; // Tab: next
        
        if (textFields[nextIndex]) {
          setEditingFieldId(textFields[nextIndex].id);
        }
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!editingFieldId && hoveredFieldId) {
        const field = fields.find((f) => f.id === hoveredFieldId);
        if (field && field.type !== 'checkbox') {
          onFieldsChange(fields.filter((f) => f.id !== hoveredFieldId));
        }
      }
    }
  }, [editingFieldId, hoveredFieldId, fields, onFieldsChange]);

  const editingField = fields.find((f) => f.id === editingFieldId);

  if (imageError) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-4 p-8', className)}>
        <div className="text-destructive font-medium">Image Error</div>
        <div className="text-sm text-muted-foreground text-center max-w-md">
          {imageError}
        </div>
      </div>
    );
  }

  if (!image) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-muted-foreground">Loading image...</div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn('relative w-full h-full', className)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="border border-border rounded-lg cursor-pointer max-w-full h-auto"
        style={{ cursor: draggingFieldId ? 'grabbing' : 'default' }}
      />
      
      {/* Inline input overlay */}
      {editingField && canvasPosition && canvasRef.current && (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={editingField.value || ''}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={handleInputBlur}
          onKeyDown={(e) => {
            // Handle Tab key for navigation between fields
            if (e.key === 'Tab') {
              e.preventDefault();
              const textFields = fields.filter(f => f.type === 'text');
              const currentIndex = textFields.findIndex(f => f.id === editingFieldId);
              
              if (currentIndex !== -1) {
                const nextIndex = e.shiftKey 
                  ? (currentIndex - 1 + textFields.length) % textFields.length // Shift+Tab: previous
                  : (currentIndex + 1) % textFields.length; // Tab: next
                
                if (textFields[nextIndex]) {
                  setEditingFieldId(textFields[nextIndex].id);
                } else {
                  // No more fields, finish editing
                  setEditingFieldId(null);
                }
              }
            } else if (e.key === 'Escape') {
              setEditingFieldId(null);
            } else if (e.key === 'Enter' && !e.shiftKey) {
              // Finish editing on Enter
              setEditingFieldId(null);
            }
          }}
          style={{
            position: 'fixed',
            left: `${canvasPosition.left + (editingField.x / canvasPosition.scaleX)}px`,
            top: `${canvasPosition.top + (editingField.y / canvasPosition.scaleY)}px`,
            width: `${editingField.width / canvasPosition.scaleX}px`,
            height: `${editingField.height / canvasPosition.scaleY}px`,
            fontSize: `${fontSize / canvasPosition.scaleX}px`, // Use global fontSize from slider
            fontFamily: fontFamily, // Use global fontFamily (apply to all fields)
            padding: '0 8px', // Tab space padding from left
            border: '2px solid #3b82f6',
            borderRadius: '2px',
            outline: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            zIndex: 1000,
            boxSizing: 'border-box',
            textAlign: 'left',
            verticalAlign: 'middle',
            lineHeight: '1.2',
          }}
          className="text-black"
        />
      )}
    </div>
  );
}
