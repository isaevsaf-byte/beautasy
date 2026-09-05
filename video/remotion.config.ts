import { Config } from "@remotion/cli/config";

// Photographs, so JPEG frames and a quality worth the fabric
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
