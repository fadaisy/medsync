# Patient app v2 · Step 11 · Native dependencies for widgets and Live Activities

**Status: deferred by the owner (16 Nov 2026: "lets first leave out widgets").** No widget or Live Activity work in this slice; S27 and S28 are not attempted. The options below stay for when it is picked up.

**Was: waiting for the owner.** The prompt says no new dependency without stopping to flag it, with its size, licence and an alternative (rule 9). Nothing below is installed.

What Step 11 needs (§5.10): phone widgets (the next visit, today's next dose), the lock screen, and a Live Activity for the day of the visit. S27: names hidden by default, no confidential names, no Help. S28: "Called" reaches the Live Activity within 5 seconds in the harness. All of it sits behind the `widgets` flag.

Facts below come from the npm registry on 16 Nov 2026. docs.expo.dev is blocked from this session, so the SDK 58 page was not read. Unpacked sizes are the npm package, not what the app binary gains. The binary cost has to be measured in an EAS build, which this session cannot run.

## Recommended: `expo-widgets` (first party)

|               |                                                                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package       | `expo-widgets@58.0.28` (`npx expo install expo-widgets`), released with Expo SDK 58                                                                                                                                        |
| Licence       | MIT                                                                                                                                                                                                                        |
| Unpacked size | 491 KB. Its one new dependency, `@expo/ui`, **is already in the phone app** (`~58.0.26`). It also pulls `@expo/plist` (a build-time helper).                                                                               |
| Covers        | iOS home-screen and lock-screen widgets and **Live Activities** (`LiveActivity.swift`). Android home-screen widgets (`ExpoWidgetsAppWidgetProvider`) and Android ongoing notifications (Peek). One config plugin for both. |
| Why           | One package, versioned and tested with our SDK, from the same team as the SDK. Widgets are written with the Expo UI components we already use.                                                                             |
| Risks         | The package is recent (SDK 55 onward) and its changelog shows recent Android launch and build fixes. We pin it with the SDK and test a release build on both platforms before the pilot.                                   |

## Alternative A: three community packages

| Package                                            | Licence | Unpacked | Covers                                                           |
| -------------------------------------------------- | ------- | -------- | ---------------------------------------------------------------- |
| `@bacons/apple-targets@5.0.0`                      | MIT     | 550 KB   | iOS widget and Live Activity targets, written in SwiftUI by hand |
| `expo-live-activity@0.4.2` (Software Mansion Labs) | MIT     | 129 KB   | iOS Live Activities, start and update from JS                    |
| `react-native-android-widget@0.26.0`               | MIT     | 515 KB   | Android widgets                                                  |

This means more control, since the iOS UI is native SwiftUI. It also means three packages, three release cycles, and Swift code to keep up.

## Alternative B: no package

We would write our own config plugin that adds the widget extension, the ActivityKit code and an Android `AppWidgetProvider`. That adds no dependency but carries the most native code to own. Not recommended for a pilot.

## Also needed whichever is chosen

- An App Group, shared between the app and the widget, so the widget can read the next visit and dose without the network. This is an Apple developer account change by the owner.
- Push to update a Live Activity for S28 ("Called" within 5 seconds). APNs Live Activity pushes need the push key on the server. The 5-second check in the harness can use a local update.
- An EAS development build to test, because widgets do not run in Expo Go.

**Question for the owner:** add `expo-widgets` (recommended), Alternative A, or Alternative B?
