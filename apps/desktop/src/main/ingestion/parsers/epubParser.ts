import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { basename } from "node:path";
import type { ChapterImport } from "../../../shared/types.js";
import { stripHtml } from "../textUtils.js";

interface OpfManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

export async function parseEpub(filePath: string): Promise<ChapterImport[]> {
  const zip = new AdmZip(filePath);
  const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

  const containerEntry = zip.getEntry("META-INF/container.xml");
  if (!containerEntry) {
    throw new Error("Invalid EPUB: missing META-INF/container.xml");
  }

  const containerDoc = xmlParser.parse(containerEntry.getData().toString("utf-8"));
  const rootfilePath = containerDoc?.container?.rootfiles?.rootfile?.["full-path"] as string | undefined;
  if (!rootfilePath) {
    throw new Error("Invalid EPUB: cannot find OPF rootfile");
  }

  const opfEntry = zip.getEntry(rootfilePath);
  if (!opfEntry) {
    throw new Error(`Invalid EPUB: missing OPF at ${rootfilePath}`);
  }

  const opfDoc = xmlParser.parse(opfEntry.getData().toString("utf-8"));
  const packageDoc = opfDoc?.package;
  const manifestItemsRaw = packageDoc?.manifest?.item;
  const spineItemsRaw = packageDoc?.spine?.itemref;

  const manifestItems = (Array.isArray(manifestItemsRaw) ? manifestItemsRaw : [manifestItemsRaw])
    .filter(Boolean)
    .map((item) => ({
      id: item.id,
      href: item.href,
      mediaType: item["media-type"]
    })) as OpfManifestItem[];

  const spineItems = (Array.isArray(spineItemsRaw) ? spineItemsRaw : [spineItemsRaw])
    .filter(Boolean)
    .map((item) => item.idref as string);

  const opfDir = rootfilePath.includes("/") ? rootfilePath.slice(0, rootfilePath.lastIndexOf("/") + 1) : "";

  const chapters: ChapterImport[] = [];
  for (let i = 0; i < spineItems.length; i += 1) {
    const idref = spineItems[i];
    const manifest = manifestItems.find((item) => item.id === idref);
    if (!manifest || !manifest.mediaType?.includes("html")) {
      continue;
    }

    const contentPath = `${opfDir}${manifest.href}`;
    const contentEntry = zip.getEntry(contentPath);
    if (!contentEntry) {
      continue;
    }

    const text = stripHtml(contentEntry.getData().toString("utf-8"));
    if (!text) {
      continue;
    }

    chapters.push({
      title: `Chapter ${i + 1}`,
      text
    });
  }

  if (chapters.length === 0) {
    chapters.push({
      title: basename(filePath, ".epub"),
      text: "No chapter content parsed from EPUB."
    });
  }

  return chapters;
}
