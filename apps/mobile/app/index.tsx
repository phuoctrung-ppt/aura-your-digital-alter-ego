import { Redirect } from "expo-router";
import { useSession } from "../src/lib/session";

/**
 * Entry redirect — authenticated → tabs; else → login.
 */
export default function Index() {
  const { isAuthenticated } = useSession();

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
