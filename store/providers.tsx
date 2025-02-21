import React from "react";
import { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { SessionProvider } from "./contexts";

const Providers = ({ children }: PropsWithChildren) => {
    const queryClient = new QueryClient();

    return (
        <SessionProvider>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </SessionProvider>
    );
};

export default Providers;
