/* Jest setup for the Expo app: native modules that have no JS fallback. */
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
require("react-native-reanimated").setUpTests();
