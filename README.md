# uGet Integration

An unofficial fork of the [uGet Extension](https://github.com/ugetdm/uget-extension) by [Gobinath (ugetdm)](https://github.com/ugetdm).

This extension integrates [uGet Download Manager](http://ugetdm.com/) with Google Chrome, Chromium, and other Chromium-based browsers.

The original **uGet Extension** was built for Manifest V2, which is now [deprecated by Google Chrome](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3).

This fork migrates the extension to **Manifest V3** so that it continues to work on the latest versions of Chrome and Chromium-based browsers.

## Prerequisites

This extension requires **[uget-integrator](https://github.com/ugetdm/uget-integrator)** to be installed on your system. The integrator bridges the browser extension with the uGet Download Manager application.

### Install uget-integrator

- [Arch Linux](https://github.com/ugetdm/uget-integrator/wiki/Installation#arch)
- [Ubuntu &amp; Linux Mint](https://github.com/ugetdm/uget-integrator/wiki/Installation#ubuntu--linux-mint)
- [Other Linux](https://github.com/ugetdm/uget-integrator/wiki/Installation#other-linux)
- [Windows (Recommended)](https://github.com/ugetdm/uget-integrator/wiki/Installation#recommended-method)
- [Windows (Portable)](https://github.com/ugetdm/uget-integrator/wiki/Installation#portable-method)

## Installation

### From Source (Developer Mode)

1. Clone this repository:

   ```bash
   git clone https://github.com/mhatrevrushab/uget-chrome-extension.git
   ```
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `extension/` directory from the cloned repo.

## Features

> See the [uget-integrator wiki](https://github.com/ugetdm/uget-integrator/wiki/Features) for detailed feature documentation with GIF demos.

- **Browser Integration** — Automatically intercept downloads and send them to uGet.
- **Skip uGet** — Hold a key or configure URL patterns to bypass uGet for specific downloads.
- **Download YouTube Videos** — Right-click to download YouTube videos via uGet.
- **Filter URLs** — Include/exclude URL patterns for download interception.
- **Batch Download** — Download all links on a page at once.
- **Download Videos (Experimental)** — Detect and download embedded media.

## Credits

This project is a fork of [uget-extension](https://github.com/ugetdm/uget-extension) by [Gobinath](https://github.com/slgobinath), originally developed under the [ugetdm](https://github.com/ugetdm) organization. All credit for the original design and implementation goes to the authors.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE), the same license as the original project.

```
Copyright (C) 2016  Gobinath
Copyright (C) 2026  Shravan (Manifest V3 migration)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```
