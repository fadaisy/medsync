import { Screen } from "@/components/tide";
import { HomeV2Body, HomeV2Header } from "@/features/v2/home-route";
import { tSpace } from "@/theme/tide";

/**
 * Home (patient app v2, feature matrix 3.1; the phone's default since ADR 0524): the header with the avatar
 * count, then the Visit mode Home. The old "your day" Home is gone: its care parts (mood, doses, readings) are
 * on the Care screen and Wellness, which Home links to, and "See a doctor" is on this Home.
 */
export default function HomeScreen() {
  return (
    <Screen
      underNav
      help="pill"
      helpSource="home"
      contentStyle={{ paddingTop: tSpace[5] }}
      header={<HomeV2Header />}
    >
      <HomeV2Body />
    </Screen>
  );
}
