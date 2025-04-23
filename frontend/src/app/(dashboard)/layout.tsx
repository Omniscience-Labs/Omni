"use client"

import { useEffect, useState } from "react"
import { SidebarLeft } from "@/components/sidebar/sidebar-left"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Clock } from "lucide-react"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const [showMaintenanceAlert, setShowMaintenanceAlert] = useState(false)
  
  useEffect(() => {
    // Show the maintenance alert when component mounts
    setShowMaintenanceAlert(true)
  }, [])

  return (
    <SidebarProvider>
      <SidebarLeft />
      <SidebarInset>
        <div className="bg-background">
          {children}
        </div>
      </SidebarInset>
      
      <AlertDialog open={showMaintenanceAlert} onOpenChange={setShowMaintenanceAlert}>
        <AlertDialogContent className="border border-muted">
          <AlertDialogHeader className="gap-3">
            <div className="flex items-center justify-center">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <AlertDialogTitle className="text-lg font-medium">High Demand Notice</AlertDialogTitle>
            <AlertDialogDescription>
              Due to exceptionally high demand, our service is currently experiencing slower response times.
              We recommend returning tomorrow when our systems will be operating at normal capacity.
              <p className="mt-2">Thank you for your understanding.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>I'll Return Tomorrow</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  )
} 