# Gyrograf

Gyrograf is a browser-based spirograph app inspired by the classic 1960s toy.

## Features

- Classic fixed set: 3 pieces (rings 150/105 and 144/96, plus one obround rack) + 18 wheels
- Track selection for ring pieces (inner or outer)
- The obround rack is outside-only and uses 96 teeth per straight section with 24 teeth per semicircular end
- Gear-like toothed visuals on both rings
- Multiple pen-holes on the small ring
- Click/hold a pen-hole and drag to roll while drawing
- Trace stays constrained to the ring path (wheel will not fall off)

## Run

Because this is plain HTML/CSS/JavaScript, you can run it with any static server.

### Option 1: VS Code Live Server

Open `index.html` with Live Server.

### Option 2: Python static server

From this folder:

```bash
python -m http.server 8080
```

Then open http://localhost:8080

## Controls

- Control panel toggle: show or hide left controls
- Mobile/narrow screens: controls auto-hide until toggled open
- Piece: Ring 150/105, Ring 144/96, or Obround rack 96/96
- Track: inner or outer for the selected ring piece
- Wheel: choose from the classic 18 wheel tooth counts
- Ink colour
- Stroke width
- Clear trace
- Reset wheel
