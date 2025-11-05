import React, { useContext } from 'react'

const SidebarContext = React.createContext({ setSidebarContent: () => {} })

export function SidebarProvider({ value, children }){
  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}

export function useSidebar(){
  return useContext(SidebarContext)
}


