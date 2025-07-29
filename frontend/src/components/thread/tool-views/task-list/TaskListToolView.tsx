import type React from "react"
import { Check, Circle, X, Clock, AlertTriangle, CircleCheck, CircleX } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { extractTaskListData, type Task, type TaskListData } from "./_utils"
import type { ToolViewProps } from "../types"
import { ScrollArea } from "@/components/ui/scroll-area"

const TaskItem: React.FC<{ task: Task; index: number }> = ({ task, index }) => {
  const isCompleted = task.status === "completed"
  const isCancelled = task.status === "cancelled"

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        isCompleted && "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700",
        isCancelled && "bg-gray-50 border-gray-200 dark:bg-gray-900/50 dark:border-gray-700",
        !isCompleted && !isCancelled && "bg-white border-gray-200 dark:bg-gray-900/50 dark:border-gray-800",
      )}
    >
      {/* Status Icon */}
      <div className="flex-shrink-0 self-center mt-0">
        {isCompleted && <CircleCheck className="h-4 w-4 text-green-600" />}
        {isCancelled && <CircleX className="h-4 w-4 text-red-600" />}
        {!isCompleted && !isCancelled && <Circle className="h-4 w-4 text-gray-400" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm leading-relaxed",
            isCompleted && "text-gray-800 dark:text-gray-200",
            isCancelled && "text-gray-500 line-through dark:text-gray-400",
            !isCompleted && !isCancelled && "text-gray-900 dark:text-gray-100",
          )}
        >
          {task.content}
        </p>
      </div>
    </div>
  )
}

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No tasks yet</h3>
    <p className="text-sm text-gray-500 dark:text-gray-400">Tasks will appear here as they are created</p>
  </div>
)

export const TaskListToolView: React.FC<ToolViewProps> = ({
  assistantContent,
  toolContent,
  isStreaming = false,
}) => {
  const taskData = extractTaskListData(assistantContent, toolContent)

  // Show loading state while streaming and no data
  if (isStreaming && !taskData) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center space-y-0 pb-4">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-blue-500 animate-spin" />
            <CardTitle className="text-base font-medium">Task List</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">Processing tasks...</p>
        </CardContent>
      </Card>
    )
  }
  console.log('taskData', taskData)
  // Show no data state if no task data
  if (!taskData) {
    return (
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center space-y-0 pb-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base font-medium">Task List</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No task data available</p>
        </CardContent>
      </Card>
    )
  }

  // Show task data
  const tasks = taskData.tasks || []
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((t) => t.status === "completed").length
  const cancelledTasks = tasks.filter((t) => t.status === "cancelled").length
  const completionPercentage = totalTasks > 0 ? ((completedTasks + cancelledTasks) / totalTasks) * 100 : 0

  return (
    <Card className="gap-0 flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
  <CardHeader className="h-14 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b p-2 px-4 space-y-2">
    <div className="flex flex-row items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="relative p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20">
          <Clock className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        </div>
        <div>
          <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            Task List
          </CardTitle>
        </div>
      </div>

      <Badge
        variant="secondary"
        className="bg-gradient-to-b from-zinc-200 to-zinc-100 text-zinc-700 dark:from-zinc-800/50 dark:to-zinc-900/60 dark:text-zinc-300"
      >
        {completedTasks}/{totalTasks} completed
      </Badge>
    </div>
  </CardHeader>

  <CardContent className="p-0 h-full flex-1 overflow-hidden relative">
    <ScrollArea className="h-full w-full">
      <div className="p-4 py-0 my-4">
        <div className="space-y-3">
          {tasks.length > 0 ? (
            tasks.map((task, index) => (
              <TaskItem key={task.id} task={task} index={index} />
            )
          )
          ) : (
            <EmptyState />
          )}
          {/* Progress Bar */}
          {tasks.length > 0 && <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700 overflow-hidden mt-4">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                completionPercentage === 0 && "bg-yellow-300",
                completionPercentage > 0 && completionPercentage <= 25 && "bg-yellow-400",
                completionPercentage > 25 && completionPercentage <= 50 && "bg-yellow-500",
                completionPercentage > 50 && completionPercentage <= 75 && "bg-green-300",
                completionPercentage > 75 && completionPercentage < 100 && "bg-green-400",
                completionPercentage === 100 && "bg-green-600"
              )}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>}
          
        </div>
      </div>
    </ScrollArea>
  </CardContent>

  <div className="px-4 py-2 h-10 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center gap-4">
    <div className="h-full flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      {tasks.length > 0 && (
        <Badge variant="outline" className="h-6 py-0.5">
          <Clock className="h-3 w-3" />
          {tasks.length} tasks
        </Badge>
      )}
    </div>
  </div>
</Card>
  )
}