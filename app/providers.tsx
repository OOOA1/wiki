"use client";
import {useState} from "react";
import {ThemeProvider} from "next-themes";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {Toaster} from "@/components/ui/sonner";
export function Providers({children}:{children:React.ReactNode}){const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,staleTime:10000,refetchOnWindowFocus:true}}}));return <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}><QueryClientProvider client={client}>{children}<Toaster position="bottom-right" richColors closeButton/></QueryClientProvider></ThemeProvider>}
