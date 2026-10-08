# Performance report

Generated: 2026-10-08T00:09:12.691Z

## Environment
- **platform**: linux
- **arch**: x64
- **cpu**: 11th Gen Intel(R) Core(TM) i5-11300H @ 3.10GHz
- **cores**: 4
- **browser**: Chromium
- **resolution**: 1280x800
- **deviceScaleFactor**: 1
- **renderer**: SwiftShader (no GPU) — documented limitation
- **build**: production (vite preview)
- **config**: {"sessionTimeSeconds":180,"spawnIntervalMs":3000}

## Three-minute match
- **simulationElapsedMs**: 179992.69999998788
- **wallClockMs**: 170707
- **framesCaptured**: 1275
- **averageFrameMs**: 140.27
- **averageFps**: 7.1
- **p95FrameMs**: 200.1
- **peakEntities**: 29
- **averageEntities**: 14.7
- **finalScore**: 0
- **measurement**: idle ship kept afloat (health pinned) so the sample covers the full match; spawns and rendering untouched

## Memory after each start/play/exit cycle
- cycle 1: 9.74 MB (delta vs baseline 3.47 MB)
- cycle 2: 10.9 MB (delta vs baseline 4.64 MB)
- cycle 3: 9.68 MB (delta vs baseline 3.41 MB)
- cycle 4: 9.8 MB (delta vs baseline 3.54 MB)
- cycle 5: 10.12 MB (delta vs baseline 3.85 MB)

## Limitations
- The reference environment runs headless Chromium on SwiftShader (software WebGL): fill-rate bound, no GPU acceleration.
- Minute-scale frame pacing was measured from rAF timestamps while the game loop advanced the simulation (delta-time, max 60 fps).
