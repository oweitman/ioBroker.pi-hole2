# ioBroker.pi-hole2

![Logo](admin/pi-hole2.png)

[![NPM version](https://img.shields.io/npm/v/iobroker.pi-hole2.svg)](https://www.npmjs.com/package/iobroker.pi-hole2)
[![Downloads](https://img.shields.io/npm/dm/iobroker.pi-hole2.svg)](https://www.npmjs.com/package/iobroker.pi-hole2)
![Number of Installations](https://iobroker.live/badges/pi-hole2-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/pi-hole2-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.pi-hole2.png?downloads=true)](https://nodei.co/npm/iobroker.pi-hole2/)

**Tests:** ![Test and Release](https://github.com/oweitman/ioBroker.pi-hole2/workflows/Test%20and%20Release/badge.svg)

## pi-hole2 adapter for ioBroker

Manage a pi-hole installation >V6.
Get information from pi-hole.
Start/Stop blocking domains.
(for pi-hole <V6 please use adapter ioBroker.pi-hole)

USE AT YOUR OWN RISK!!! ABSOLUTELY NO WARRANTY FOR DAMAGES, ETC.!!!

Help or hints are welcome.

This adapter was rewritten for pi-hole V6 based on an idea by
Michael Schuster <development@unltd-networx.de>.

## Steps

1. Install the adpater

2. Fill in the fields of the adapter-admin. The url of the pi-hole device, the password, and obligatory the intervall to renew the values of the pi-hole (renew statistic in iobroker)

## Functions

### Enable/Disable the blocking

To Enable/Disable the blocking, please use the switch in Datapoint Blocking. The BlockingTime is only used for disabling the blocking to automaticly reenable the blocking. Enabling takes place immediately.

### General SendTo Function

The sendTo function is used to send commands to the pi-hole device.
You can try the api on your local machine.
Go to <http://pi.hole/api/docs/#> and enter your password and press login button.

#### Example

```javascript
sendTo(
    'pi-hole2.0',
    'piholeapi',
    {
        method: 'GET',
        endpoint: '/history/clients',
        params: {
            N: 20,
        },
    },
    function (data) {
        console.log(data);
    },
);
```

## Todo Existing Functions

- ~~login~~
- ~~interval time~~
- ~~activate / decativate blocking~~
- ~~activating / deactivating timeinterval~~
- version ? dont know details
- ~~versions~~
- type
- summaryRaw ? dont know details
- ~~summary~~
- topItems ? dont know details
- getQuerySources ? dont know details
- overTimeData10mins ? dont know details
- getForwardDestinations ? dont know details

## Todo New Functions

- ~~sendTo Functions to control and get informations with parameters~~

## Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**

- (oweitman) initial release

## License

MIT License

Copyright (c) 2025 oweitman <oweitman@gmx.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
