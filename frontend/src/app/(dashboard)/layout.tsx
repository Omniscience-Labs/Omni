"use client"

import { useEffect, useState } from "react"
import { SidebarLeft } from "@/components/sidebar/sidebar-left"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { MaintenanceAlert } from "@/components/maintenance-alert"
import { useAccounts } from "@/hooks/use-accounts"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const [showMaintenanceAlert, setShowMaintenanceAlert] = useState(false)
  const { data: accounts } = useAccounts()
  const personalAccount = accounts?.find(account => account.personal_account)
  
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
      
      <MaintenanceAlert 
        open={showMaintenanceAlert} 
        onOpenChange={setShowMaintenanceAlert}
        closeable={true}
        accountId={personalAccount?.account_id}
      />
    </SidebarProvider>
  )
} 