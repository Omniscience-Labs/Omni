import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch, MoreHorizontal, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getConditionLabel } from '../utils';
import { useReactFlow } from '@xyflow/react';

const ConditionNode = ({ id, data, selected }: any) => {
  const { setNodes } = useReactFlow();
  
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState({
    conditionType: data.conditionType || 'if',
    expression: data.expression || '',
  });

  const handleSave = () => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              conditionType: editData.conditionType,
              expression: editData.expression,
            },
          };
        }
        return node;
      })
    );
    setIsEditOpen(false);
  };

  return (
    <div 
      className={cn(
        "react-flow__node-condition group",
        selected && "selected"
      )}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="react-flow__handle"
      />
      <div className="condition-node-content">
        <div className={cn(
          "condition-type-badge",
          data.conditionType === 'if' && "condition-type-if",
          data.conditionType === 'elseif' && "condition-type-elseif",
          data.conditionType === 'else' && "condition-type-else"
        )}>
          {getConditionLabel(data.conditionType)}
        </div>
        {data.expression && data.conditionType !== 'else' && (
          <div className="condition-expression" title={data.expression}>
            "{data.expression}"
          </div>
        )}
        {!data.expression && data.conditionType !== 'else' && (
          <div className="condition-expression text-muted-foreground">
            No condition set
          </div>
        )}
        <div className="node-actions">
          <Popover open={isEditOpen} onOpenChange={setIsEditOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-sm mb-3">Edit Condition</h3>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs">Condition Type</Label>
                  <Select
                    value={editData.conditionType}
                    onValueChange={(value) => setEditData({ ...editData, conditionType: value })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="if">If</SelectItem>
                      <SelectItem value="elseif">Else If</SelectItem>
                      <SelectItem value="else">Else</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editData.conditionType !== 'else' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Expression</Label>
                    <Input
                      value={editData.expression}
                      onChange={(e) => setEditData({ ...editData, expression: e.target.value })}
                      placeholder="e.g., user asks about pricing"
                      className="h-8"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditData({
                        conditionType: data.conditionType || 'if',
                        expression: data.expression || '',
                      });
                      setIsEditOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="end">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onDelete(id);
                }}
                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete condition
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="react-flow__handle"
      />
    </div>
  );
};

export default memo(ConditionNode); 