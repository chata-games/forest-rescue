#!/usr/bin/env python3
"""Check the canvas battlefield with chrome-agent and a running local server.

Usage: python3 tools/check-battlefield-visuals.py [http://localhost:8341]
Screenshots are saved in /tmp for visual inspection.
"""
import base64
import json
from pathlib import Path
import subprocess
import sys


def cli(*args):
    return subprocess.check_output(["chrome-agent", *args], text=True, timeout=40)


instance = json.loads(cli("launch", "--headless"))["name"]


def call(method, params=None):
    return json.loads(cli(instance, method, json.dumps(params or {})))


def evaluate(expression):
    result = call("Runtime.evaluate", {
        "expression": expression, "awaitPromise": True, "returnByValue": True,
    })
    assert "exceptionDetails" not in result, result
    return result["result"].get("value")


def wait_for(expression):
    return evaluate("""new Promise((resolve, reject) => {
      const deadline = performance.now() + 20000;
      const check = () => {
        if (%s) return resolve(true);
        if (performance.now() > deadline) return reject(new Error('Readiness timeout'));
        requestAnimationFrame(check);
      }; check();
    })""" % expression)


def tap(x, y):
    for kind in ["mousePressed", "mouseReleased"]:
        call("Input.dispatchMouseEvent", {
            "type": kind, "x": x, "y": y, "button": "left", "clickCount": 1,
        })


try:
    call("Emulation.setDeviceMetricsOverride", {
        "width": 1920, "height": 936, "deviceScaleFactor": 1, "mobile": False,
    })
    instrumentation = """
      window.visualCheck = { errors: [], sentinel: false, flower: null };
      addEventListener('error', e => visualCheck.errors.push(e.message || 'Resource error'), true);
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args) {
        const src = args[0]?.src || '';
        if (src.includes('units.png') && args.length === 9 && args[7] === 123 && args[8] === 123)
          visualCheck.sentinel = true;
        if (src.includes('mana-flower.png')) {
          const r = this.canvas.getBoundingClientRect();
          visualCheck.flower = { x: r.x + args[1] + args[3] / 2,
            y: r.y + args[2] + args[4] / 2 };
        }
        return draw.apply(this, args);
      };
    """
    origin = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8341"
    call("Page.navigate", {"url": origin + "/?level=01-meadows-edge"})
    wait_for("document.querySelectorAll('.tool-button').length === 2")
    evaluate(instrumentation)
    evaluate("""(async () => {
      window.checkLevel = await (await fetch('levels/compiled/01-meadows-edge.json')).json();
      window.ringPoint = ring => {
        const r = document.getElementById('gameCanvas').getBoundingClientRect();
        const s = Math.min(r.width / 1536, r.height / 1024);
        return { x: r.x + (r.width - 1536*s)/2 + ring.x*s,
          y: r.y + (r.height - 1024*s)/2 + ring.y*s };
      };
    })()""")
    point = evaluate("ringPoint(checkLevel.rings.find(r => r.placement === 'beside-path' && r.x > 400))")
    before = int(evaluate("document.getElementById('manaText').textContent"))
    tap(point["x"], point["y"])
    wait_for("visualCheck.sentinel")
    after = int(evaluate("document.getElementById('manaText').textContent"))
    assert 40 <= before - after <= 50, (before, after)
    evaluate("document.getElementById('startWaveButton').click()")
    wait_for("visualCheck.flower !== null")
    shot = call("Page.captureScreenshot", {"format": "png"})
    Path("/tmp/forest-rescue-visuals.png").write_bytes(base64.b64decode(shot["data"]))
    point = evaluate("visualCheck.flower")
    before = int(evaluate("document.getElementById('manaText').textContent"))
    tap(point["x"], point["y"])
    after = int(evaluate("document.getElementById('manaText').textContent"))
    assert 20 <= after - before <= 30, (before, after)
    evaluate("document.querySelectorAll('.tool-button')[1].click()")
    point = evaluate("ringPoint(checkLevel.rings.find(r => r.placement === 'on-path'))")
    before = int(evaluate("document.getElementById('manaText').textContent"))
    tap(point["x"], point["y"])
    after = int(evaluate("document.getElementById('manaText').textContent"))
    assert 25 <= before - after <= 35, (before, after)
    assert evaluate("visualCheck.errors") == []
    print("PASS: Sentinel drawn at 123x123; flower collected for 20 mana; blocker planted for 35 mana; no browser errors")
    print("Screenshot: /tmp/forest-rescue-visuals.png")
finally:
    cli("stop", instance)
    status = cli("status").strip()
    remaining = json.loads(status) if status.startswith("[") else []
    assert not any(item["name"] == instance and item.get("alive") for item in remaining), remaining
