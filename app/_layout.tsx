import Providers from "@/store/providers";
import { Slot } from "expo-router";

export default function RootLayout() {
  return (
    <Providers>
      <Slot />
    </Providers>
  );
}
