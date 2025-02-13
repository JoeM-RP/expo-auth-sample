import React from "react";
import { PropsWithChildren } from "react";
import { ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { SessionProvider } from "./contexts";

const Providers = ({ children }: PropsWithChildren) => {

    return (
        <SessionProvider>
            {/* <NavigationThemeProvider> */}
                {children}
            {/* </NavigationThemeProvider> */}
        </SessionProvider>
    );
};

export default Providers;
