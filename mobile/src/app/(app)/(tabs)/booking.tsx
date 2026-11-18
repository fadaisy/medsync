import { BookView } from "@/app/(app)/book/index";

/**
 * Book, as a place (patient app v2, feature matrix 1.1): the same Book screen, shown under the nav. Its Help
 * is Book's own (law L6: the crawl checks it on `book/index.tsx`). `/book` is still the pushed screen with a
 * Back, for the links that open Book from another page.
 */
export default function BookingTab() {
  return <BookView tab />;
}
