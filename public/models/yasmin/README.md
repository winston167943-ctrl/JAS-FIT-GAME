# Yasmin 3D model goes here

Put the rigged character + animations in this folder and add `manifest.json`:

```json
{
  "model": "character.fbx",
  "animations": {
    "idle": "idle.fbx", "walk": "walk.fbx", "run": "run.fbx", "jump": "jump.fbx",
    "lift": "lift.fbx", "band": "band.fbx", "drink": "drink.fbx", "eat": "eat.fbx",
    "sit": "sit.fbx", "sleep": "sleep.fbx", "wave": "wave.fbx", "flex": "flex.fbx",
    "dance": "dance.fbx", "tired": "tired.fbx", "swim": "swim.fbx", "talk": "talk.fbx"
  }
}
```

Missing animations fall back automatically (e.g. `treadmill` → `run`). The game swaps
the procedural Yasmin for this model on load; body fat / tone is applied through bone
scaling, so she still gets heavier or more toned depending on how she lives.
