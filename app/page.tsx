import Nav from "@/components/Nav";
import StageLoader from "@/components/bim/StageLoader";
import StatusBar from "@/components/chrome/StatusBar";
import Hero from "@/components/sections/Hero";
import Story from "@/components/sections/Story";
import GridWipe from "@/components/sections/GridWipe";
import Shop from "@/components/sections/Shop";
import Reach from "@/components/sections/Reach";
import Work from "@/components/sections/Work";
import Credentials from "@/components/sections/Credentials";
import Contact from "@/components/sections/Contact";
import Footer from "@/components/sections/Footer";

/**
 * All Air Mechanical — the website as a BIM model and drawing set.
 * A fixed WebGL stage holds one illustrative building: the hero is its default
 * 3D view and the systems story a drone-flown coordination model. Every later
 * section is a saved view of the set — a detail, a site plan, a schedule, a
 * title block — opened by a view title, inside BIM-app chrome (ribbon above,
 * status bar below).
 */
export default function Page() {
  return (
    <>
      <Nav />
      <StageLoader />
      <main id="top" className="relative z-10">
        <Hero />
        <Story />
        <GridWipe />
        <Shop />
        <Reach />
        <Work />
        <Credentials />
        <Contact />
      </main>
      <Footer />
      <StatusBar />
    </>
  );
}
