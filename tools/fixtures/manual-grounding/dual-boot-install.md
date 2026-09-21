<!-- fixture for tools/test_nixi.py test_tools_route: one section of olafkfreund/nixarchy docs/manual/dual-boot-install.md at 28208eeffc7691019c20446e6d1f96ce7bb62df3 (MIT) -->
# Dual boot install

The nixarchy installer offers two disk modes, the way Omarchy's does:

- **Full disk install** — the disk is nixarchy's, and everything on it is gone.
- **Free space install** — nixarchy goes into the largest unpartitioned region
  on the disk, and every partition already there is left exactly as it was.

The second screen only appears when it can. On a disk with no partitions there
is nothing to install beside, so the question is not asked at all.
