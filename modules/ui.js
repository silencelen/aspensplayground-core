// ============================================
// ASPEN'S PLAYGROUND - UI Module
// ============================================

// ==================== KILL FEED ====================
const KillFeed = {
    maxEntries: 6,
    container: null,

    init() {
        this.container = document.getElementById('kill-feed');
    },

    addKill(zombieType, isHeadshot = false, isBoss = false, points = 0) {
        if (!this.container) this.init();
        if (!this.container) return;

        const entry = document.createElement('div');
        entry.className = 'kill-entry';
        if (isHeadshot) entry.classList.add('headshot');
        if (isBoss) entry.classList.add('boss');

        // Icon based on zombie type
        const icons = {
            'normal': '\u{1F9DF}',
            'runner': '\u{1F3C3}',
            'tank': '\u{1F4AA}',
            'spitter': '\u{1F922}',
            'exploder': '\u{1F4A5}',
            'boss': '\u{1F480}'
        };
        const icon = icons[zombieType] || '\u{1F9DF}';

        const typeLabel = isBoss ? 'BOSS' : zombieType.charAt(0).toUpperCase() + zombieType.slice(1);
        const headshotText = isHeadshot ? ' \u{1F3AF}' : '';

        entry.innerHTML = `
            <span class="kill-icon">${icon}</span>
            <span class="kill-type">${typeLabel}${headshotText}</span>
            <span class="kill-points">+${points}</span>
        `;

        this.container.insertBefore(entry, this.container.firstChild);

        // Limit entries
        while (this.container.children.length > this.maxEntries) {
            this.container.removeChild(this.container.lastChild);
        }

        // Auto-remove after delay
        setTimeout(() => {
            if (entry.parentNode) {
                entry.classList.add('fade-out');
                setTimeout(() => entry.remove(), 500);
            }
        }, 4000);
    },

    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
};

// ==================== DAMAGE NUMBERS ====================
const DamageNumbers = {
    container: null,

    init() {
        this.container = document.getElementById('damage-numbers');
    },

    show(worldPos, damage, isHeadshot = false, isCritical = false) {
        if (!this.container) this.init();
        if (!this.container) return;

        // Convert world position to screen position
        const screenPos = this.worldToScreen(worldPos);
        if (!screenPos) return;

        const number = document.createElement('div');
        number.className = 'damage-number';
        if (isCritical) {
            number.classList.add('critical');
        } else if (isHeadshot) {
            number.classList.add('headshot');
        } else {
            number.classList.add('normal');
        }

        number.textContent = Math.round(damage);
        number.style.left = `${screenPos.x}px`;
        number.style.top = `${screenPos.y}px`;

        // Random horizontal offset for variety
        const offsetX = (Math.random() - 0.5) * 40;
        number.style.transform = `translateX(${offsetX}px)`;

        this.container.appendChild(number);

        // Remove after animation
        setTimeout(() => number.remove(), 1000);
    },

    worldToScreen(worldPos) {
        // Requires camera to be defined globally
        if (typeof camera === 'undefined') return null;

        const vector = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
        vector.project(camera);

        // Check if behind camera
        if (vector.z > 1) return null;

        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;

        return { x, y };
    },

    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
};

// ==================== SCREEN ORIENTATION (Mobile) ====================
function initScreenOrientation() {
    if (typeof isMobile === 'undefined' || !isMobile) return;

    // Try to lock orientation using Screen Orientation API
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(e => {
            DebugLog.log('Could not lock orientation: ' + e.message, 'warn');
        });
    }

    const handleOrientationChange = () => {
        const isPortrait = window.innerHeight > window.innerWidth;
        const overlay = document.getElementById('rotate-device-overlay');
        if (!overlay) return;

        if (isPortrait && isMobile) {
            overlay.style.display = 'flex';
            // Pause game if running
            if (typeof GameState !== 'undefined' && GameState.isRunning && !GameState.isPaused) {
                GameState.isPaused = true;
            }
        } else {
            overlay.style.display = 'none';
        }
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    // Initial check
    handleOrientationChange();
}
