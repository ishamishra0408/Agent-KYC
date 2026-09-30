import { fileURLToPath } from "node:url";

// The IDNet sample (D-040): synthetic South Dakota driving licences from the public-domain (CC0)
// IDNet dataset on Zenodo (Xie et al., "IDNet: A Novel Identity Document Dataset via Few-Shot and
// Quality-Driven Synthetic Data Generation", IEEE BigData 2024).
export const IDNET_URL = "https://zenodo.org/records/13852734/files/SD.zip?download=1";
export const IDNET_DIR = fileURLToPath(new URL("./SD", import.meta.url)); // git-ignored
export const SAMPLE_SIZE = 30;
// Forgeries that keep the genuine licence's file name, so each one is tested against its own original.
export const FORGERIES = ["fraud1_copy_and_move", "fraud2_face_morphing", "fraud3_face_replacement", "fraud4_combined"] as const;
