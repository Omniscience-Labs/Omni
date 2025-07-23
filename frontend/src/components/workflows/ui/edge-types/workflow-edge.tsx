import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
} from '@xyflow/react';
import useEdgeClick from '../hooks/use-edge-click';
import { useState } from 'react';
import { Plus, GitBranch } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

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
  const { addStepOnEdge, addConditionOnEdge } = useEdgeClick(id);
  const [isOpen, setIsOpen] = useState(false);

  const [edgePath, edgeCenterX, edgeCenterY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const handleAddStep = () => {
    addStepOnEdge();
    setIsOpen(false);
  };

  const handleAddCondition = (type: 'if' | 'if-else' | 'if-elseif-else', connectBranches: string[] = []) => {
    addConditionOnEdge(type, connectBranches);
    setIsOpen(false);
  };

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
        <div
          style={{
            position: 'absolute',
            transform: `translate(${edgeCenterX}px, ${edgeCenterY}px) translate(-50%, -50%)`,
          }}
        >
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <button className="edge-button nodrag nopan">
                <Plus className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuItem onClick={handleAddStep}>
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <GitBranch className="h-4 w-4 mr-2" />
                  <span className="text-xs font-mono mr-2">if</span>
                  Single condition
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleAddCondition('if', ['if'])}>
                    Connect "if" to next step
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddCondition('if', [])}>
                    Leave unconnected
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <GitBranch className="h-4 w-4 mr-2" />
                  <span className="text-xs font-mono mr-2">if-else</span>
                  Two branches
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleAddCondition('if-else', ['if'])}>
                    Connect "if" to next step
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddCondition('if-else', ['else'])}>
                    Connect "else" to next step
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddCondition('if-else', ['if', 'else'])}>
                    Connect both to next step
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddCondition('if-else', [])}>
                    Leave unconnected
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <GitBranch className="h-4 w-4 mr-2" />
                  <span className="text-xs font-mono mr-2">if-elif-else</span>
                  Three branches
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleAddCondition('if-elseif-else', ['if'])}>
                    Connect "if" to next step
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddCondition('if-elseif-else', ['elseif'])}>
                    Connect "else if" to next step
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddCondition('if-elseif-else', ['else'])}>
                    Connect "else" to next step
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddCondition('if-elseif-else', ['if', 'elseif', 'else'])}>
                    Connect all to next step
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddCondition('if-elseif-else', [])}>
                    Leave unconnected
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </EdgeLabelRenderer>
    </>
  );
} 