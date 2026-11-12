define([], function() {
	'use strict';

	/**
	 * Tooltips - NTK draws every title="..." tooltip itself.
	 *
	 * Electron on macOS hands title tooltips to the system, which stops
	 * showing them after some clicks: click inside a widget and no
	 * tooltip shows until you click the empty canvas, or one has shown
	 * over a port (2026-11-12). Electron has no setting for that, so
	 * instead: when the pointer rests on anything with a title, its text
	 * shows in a small box by the pointer. No widget needs to change -
	 * the title attribute stays the place to put a tooltip.
	 *
	 * While the pointer is on an element, its title is moved to
	 * data-ntk-tip so the system's own tooltip never shows as well, and
	 * put back when the pointer leaves. Code that sets the title while
	 * the pointer is there (a rivets rv-title binding) is caught by a
	 * MutationObserver and shown at once.
	 */

	var DELAY_MS = 500;    // rest this long before a tooltip shows
	var WARM_MS = 600;     // ...or only this long after one just hid
	var QUICK_MS = 80;
	var OFFSET = 14;       // box offset from the pointer, px

	var box = null;
	var target = null;     // the element whose title is borrowed
	var timer = null;
	var shown = false;
	var lastHidden = 0;
	var pointer = {x: 0, y: 0};
	var suppressed = false; // after a press, until the pointer moves to another element
	var observer = null;

	function ensureBox() {
		if(box) { return box; }
		box = document.createElement('div');
		box.className = 'ntkTooltip';
		box.setAttribute('role', 'tooltip');
		document.body.appendChild(box);
		return box;
	}

	function textOf(el) {
		return el.getAttribute('data-ntk-tip') || '';
	}

	// Take el's title so the system tooltip doesn't show too.
	function borrow(el) {
		var t = el.getAttribute('title');
		if(t !== null) {
			el.setAttribute('data-ntk-tip', t);
			el.removeAttribute('title');
		}
	}

	// Give the title back - unless code set a new one meanwhile.
	function giveBack(el) {
		if(!el) { return; }
		if(el.getAttribute('title') === null && el.hasAttribute('data-ntk-tip')) {
			el.setAttribute('title', el.getAttribute('data-ntk-tip'));
		}
		el.removeAttribute('data-ntk-tip');
	}

	function place() {
		if(!box) { return; }
		var w = box.offsetWidth, h = box.offsetHeight;
		var vw = window.innerWidth, vh = window.innerHeight;
		var x = pointer.x + OFFSET, y = pointer.y + OFFSET + 4;
		if(x + w > vw - 4) { x = Math.max(4, vw - w - 4); }
		if(y + h > vh - 4) { y = Math.max(4, pointer.y - h - OFFSET); }
		box.style.left = x + 'px';
		box.style.top = y + 'px';
	}

	function show() {
		timer = null;
		if(!target || !document.body.contains(target)) { return; }
		var text = textOf(target);
		if(!text) { return; }
		ensureBox().textContent = text;
		box.classList.add('visible');
		shown = true;
		place();
	}

	function hide() {
		if(timer) { clearTimeout(timer); timer = null; }
		if(shown) { lastHidden = Date.now(); }
		shown = false;
		if(box) { box.classList.remove('visible'); }
	}

	function release() {
		hide();
		if(observer) { observer.disconnect(); }
		giveBack(target);
		target = null;
	}

	function watch(el) {
		if(!window.MutationObserver) { return; }
		if(!observer) {
			observer = new MutationObserver(function() {
				if(!target) { return; }
				var t = target.getAttribute('title');
				if(t === null) { return; }
				// New text set while the pointer is here: take it and show it.
				target.setAttribute('data-ntk-tip', t);
				target.removeAttribute('title');
				if(shown) {
					if(t) { box.textContent = t; place(); } else { hide(); }
				}
			});
		}
		observer.observe(el, {attributes: true, attributeFilter: ['title']});
	}

	function titled(el) {
		while(el && el.nodeType === 1) {
			if(el.hasAttribute('title') || el.hasAttribute('data-ntk-tip')) { return el; }
			el = el.parentElement;
		}
		return null;
	}

	function onOver(e) {
		pointer.x = e.clientX; pointer.y = e.clientY;
		var el = titled(e.target);
		if(el === target) { return; }
		release();
		suppressed = false;
		if(!el) { return; }
		target = el;
		borrow(el);
		watch(el);
		// Not while a button is held - a widget or cable being dragged.
		if(e.buttons) { return; }
		var wait = Date.now() - lastHidden < WARM_MS ? QUICK_MS : DELAY_MS;
		timer = setTimeout(show, wait);
	}

	function onMove(e) {
		pointer.x = e.clientX; pointer.y = e.clientY;
		if(shown) { place(); return; }
		// Resting restarts the wait, like the system's tooltips.
		if(target && !suppressed && !e.buttons) {
			if(timer) { clearTimeout(timer); }
			timer = setTimeout(show, Date.now() - lastHidden < WARM_MS ? QUICK_MS : DELAY_MS);
		}
	}

	function onPress() {
		// A click hides it, and it stays hidden on this element.
		hide();
		suppressed = true;
	}

	function onLeaveWindow(e) {
		if(!e.relatedTarget) { release(); }
	}

	function start() {
		document.addEventListener('mouseover', onOver, true);
		document.addEventListener('mousemove', onMove, true);
		document.addEventListener('mousedown', onPress, true);
		document.addEventListener('wheel', hide, {capture: true, passive: true});
		document.addEventListener('keydown', hide, true);
		document.addEventListener('mouseout', onLeaveWindow, true);
		window.addEventListener('blur', release);
	}

	if(document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}

	return {hide: hide};
});
