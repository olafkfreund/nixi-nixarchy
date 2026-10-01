<!-- fixture for tools/test_nixi.py test_tools_route: one section of olafkfreund/nixarchy docs/manual/per-project-environments.md at 28208eeffc7691019c20446e6d1f96ce7bb62df3 (MIT) -->
# Per-project environments

One folder, one command, and the folder has a working toolchain that appears
when you `cd` in and is gone when you leave:

```sh
mkdir hello-react && cd hello-react
nixarchy dev init react
```

The next prompt in that directory is inside the environment, and `node
--version` answers the project's Node rather than the machine's. Nothing was
installed on the machine: that Node is pinned in a file the project owns, and
committing that file is how a colleague gets the same one.

![nixarchy dev init listing the presets, then scaffolding a real project — the devenv files written into the directory](../img/features/devenv.gif)

This is nixarchy's, not Omarchy's — upstream reaches for `mise use`, which
[Development tools](development-tools) explains does not fit here. It is also
not on by default.

Once it is on, you also get the **Dev environments** panel: every project on
the machine in one list, on **Super+Alt+E** and under **Apps ▸ Dev
environments**. See [The panel](#the-panel) below.
