import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
} from '@xyflow/react';
import useEdgeClick from '../hooks/use-edge-click';

export default function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
}: EdgeProps) {
  const onClick = useEdgeClick(id);

  const [edgePath, edgeCenterX, edgeCenterY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      <BaseEdge id={id} style={style} path={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {label && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(${sourceX + 50}px, ${sourceY + 30}px) translate(-50%, -50%)`,
              background: labelBgStyle?.fill || '#fff',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: labelStyle?.fontSize || 12,
              color: labelStyle?.fill || '#666',
              pointerEvents: 'none',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
            }}
          >
            {label}
          </div>
        )}
        <button
          style={{
            transform: `translate(${edgeCenterX}px, ${edgeCenterY}px) translate(-50%, -50%)`,
          }}
          onClick={onClick}
          className="edge-button nodrag nopan"
        >
          +
        </button>
      </EdgeLabelRenderer>
    </>
  );
} 