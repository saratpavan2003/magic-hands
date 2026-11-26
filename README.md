# 🪄 Magic Hands

Do magic with your hands in front of your phone's camera. No touching!

- **✨ Sparkle Wand:** point your finger and draw a rainbow trail in the air. Open your hand wide for a star burst.
- **🔥 Fireball:** open your hand to grow a fireball. Swing your hand fast to throw it, or push it at the camera. Make a fist to put it out.
- **🫧 Bubble Pop:** pop rising bubbles with your fingertips and keep score.
- **🏹 Archery:** prop the phone up facing you and step back 2–3 big steps so the camera sees your arms. Raise one arm out to the side and a bow appears in that hand. It stays while that hand is up, wherever you point it, and goes away when you drop it. A quiver of 10 arrows sits behind your other shoulder: reach up over that shoulder to grab an arrow, pull it back to your chin to draw the string, then move it away to let go. When the quiver is empty it fills up again after a few seconds. Tips at the bottom of the screen walk you through the first three arrows. Shooting sideways, a dotted line shows the arrow's arc. Pointing the bow at the phone, a crosshair shows where the arrow will land. Hit targets (10 for the bullseye, 5 and 2 for the rings) and balloons (3). Turning the phone sideways gives more room. With AirPlay Screen Mirroring, the TV becomes the game board.

It works in Safari on iPhone and in Chrome on Android and computers. The camera picture fills the screen; tap ⤢ to see the whole picture instead (⤡ fills the screen again). For the biggest view on iPhone, tap Share ⬆️ → **Add to Home Screen** and open Magic Hands from the home screen: it opens full screen, without Safari's bars. There's nothing to install. "👆 Use my finger instead" plays the same magic by touching the screen, and takes over if the camera can't start.

## 🐍 Snakes & Ladders pop-up book (`snakes.html`)

A 3D bookcase appears in your room through the back camera, held in place by the phone's motion sensors as you look around. Tap the glowing green **Snakes & Ladders** book: it slides off the shelf, flies to you and opens like a laptop. The near half lies flat with the dice on it; the far half stands up, and the board pops out of it, facing you. Then the ladders and snakes rise out of the board. The snakes slither all the time (a wave runs down each body, heads sway, tongues flick), and a snake lunges to bite a piece that lands on its head before it slides down.

- The board is a jungle: a waterfall and river with a rope bridge, a tiger, an elephant, monkeys, a toucan, a parrot and a frog (`images/jungle-board.jpg`, painted with an AI image generator). The squares and numbers are drawn over it in code, so the picture can be swapped for another one.
- **2–4 players**, each a person or the computer, with names you can change.
- **Roll** with the 🎲 button, by tapping the die, or by **shaking the phone**.
- Climb ladders, slide down snakes, land exactly on 100 to win (a roll that would go past it doesn't move you), and a 6 rolls again.
- Drag sideways to turn the book, pinch to make it bigger, and 🎯 brings everything back in front of you.
- "Play without the camera" shows the same game on a plain background, where dragging looks around the book.

The other books on the shelf are "coming soon". The bookcase stays put as you turn the phone, but it doesn't know when you walk around (that needs depth sensing that iPhone browsers don't offer).

## Privacy

The camera only starts after "Start the magic!", and the browser asks first. Each camera picture is looked at on the device to find the hands (or, in Archery, the arms and shoulders), then thrown away. Nothing is recorded, saved or sent anywhere. Every file, including the hand-tracking engine and model, comes from this site.

## Putting it online (GitHub Pages)

Phones only allow the camera on secure (https) sites, and GitHub Pages provides that for free.

1. On GitHub, open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick the branch and the `/ (root)` folder, then **Save**.
3. After a minute or two the page shows your link, like `https://<your-username>.github.io/magic-hands/`. Open it in Safari on your iPhone.

## How it's made

A plain web page with no build step:

```
index.html            The page
manifest.webmanifest  Lets "Add to Home Screen" open it full screen, with the icons in icons/
style.css             Colors, buttons, and the full-screen magic stage (the camera picture is drawn on the canvas, so the magic lines up with it)
src/main.js           Fills in the words and starts the magic
src/words.js          Every word kids see (change the wording here)
src/magic-page.js     Camera, hand tracking, effects, sounds and the main loop
src/magic.js          Hand shapes and fireball/bubble rules (no page code, tested)
snakes.html, snakes.css  The Snakes & Ladders page
src/snakes/game.js    Snakes & Ladders rules: board, moves, snakes, ladders, turns, winning (tested)
src/snakes/scene.js   The 3D world: bookcase, pop-up book, board, snakes, ladders, pieces, dice
src/snakes/main.js    Players, camera, motion sensors, shake to roll, turns and the winner screen
vendor/three/         three.js 0.187 (MIT), for the 3D drawing
src/archery.js        Archery rules: which arm holds the bow, drawing, letting go, aim, points (tested)
vendor/               Google's MediaPipe hand-tracking engine (@mediapipe/tasks-vision 0.10.35, Apache-2.0)
model/                MediaPipe's hand model (21 points per hand) and pose model (33 body points, used by Archery)
tests/                Unit tests: npm install, then npm test
```

To try it on a computer, run `npm start` and open http://localhost:8080. The camera works on `localhost`, but other devices need https.

Hand tracking can also be tried without a camera: Chrome can use a video file as its camera, with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=hand.y4m`.
