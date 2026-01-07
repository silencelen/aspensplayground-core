// ============================================
// ASPEN'S PLAYGROUND - Audio Manager Module
// Professional audio system with file loading and 3D support
// ============================================

const AudioManager = {
    // Audio context and master gain
    context: null,
    masterGain: null,
    sfxGain: null,
    musicGain: null,

    // Loaded audio buffers cache
    buffers: new Map(),

    // Loading state
    isInitialized: false,
    isLoading: false,
    loadedCount: 0,
    totalCount: 0,

    // 3D Audio listener
    listener: null,

    // Sound definitions with file paths and settings
    sounds: {
        // === WEAPONS ===
        pistol: {
            src: 'sounds/weapons/pistol.ogg',
            volume: 0.8,
            variations: 1,
            fallback: 'procedural'
        },
        smg: {
            src: 'sounds/weapons/smg.mp3',
            volume: 0.7,
            variations: 1,
            fallback: 'procedural'
        },
        shotgun: {
            src: 'sounds/weapons/shotgun.ogg',
            volume: 0.9,
            variations: 1,
            fallback: 'procedural'
        },
        rocket: {
            src: 'sounds/weapons/rocket.ogg',
            volume: 0.85,
            variations: 1,
            fallback: 'procedural'
        },
        laser: {
            src: 'sounds/weapons/laser.ogg',
            volume: 0.6,
            variations: 1,
            fallback: 'procedural'
        },
        reload: {
            src: 'sounds/weapons/reload.wav',
            volume: 0.7,
            variations: 1,
            fallback: 'procedural'
        },
        weaponSwitch: {
            src: null // procedural only,
            volume: 0.5,
            variations: 1,
            fallback: 'procedural'
        },
        // Generic shoot sound (used when weapon type is unknown)
        shoot: {
            src: 'sounds/weapons/pistol.ogg',
            volume: 0.8,
            variations: 1,
            fallback: 'procedural'
        },

        // === COMBAT ===
        hit: {
            src: null // procedural only,
            volume: 0.8,
            variations: 1,
            fallback: 'procedural'
        },
        explosion: {
            src: 'sounds/combat/explosion.ogg',
            volume: 0.9,
            variations: 1,
            fallback: 'procedural'
        },
        grenadeThrow: {
            src: 'sounds/combat/grenade_throw.wav',
            volume: 0.6,
            variations: 1,
            fallback: 'procedural'
        },
        zombieAttack: {
            src: null // procedural only,
            volume: 0.7,
            variations: 3,
            fallback: 'procedural'
        },
        zombieDeath: {
            src: null // procedural only,
            volume: 0.75,
            variations: 3,
            fallback: 'procedural'
        },
        zombieGrowl: {
            src: null // procedural only,
            volume: 0.5,
            variations: 3,
            fallback: 'procedural'
        },
        glass: {
            src: null // procedural only,
            volume: 0.7,
            variations: 1,
            fallback: 'procedural'
        },

        // === FEEDBACK/UI ===
        pickup: {
            src: null // procedural only,
            volume: 0.7,
            variations: 1,
            fallback: 'procedural'
        },
        killStreak: {
            src: null // procedural only,
            volume: 0.6,
            variations: 1,
            fallback: 'procedural'
        },
        lowHealth: {
            src: null // procedural only,
            volume: 0.5,
            variations: 1,
            fallback: 'procedural'
        },
        waveComplete: {
            src: null // procedural only,
            volume: 0.7,
            variations: 1,
            fallback: 'procedural'
        },
        gameOver: {
            src: null // procedural only,
            volume: 0.8,
            variations: 1,
            fallback: 'procedural'
        },
        menuClick: {
            src: null // procedural only,
            volume: 0.5,
            variations: 1,
            fallback: 'procedural'
        },

        // === FOOTSTEPS ===
        footstep: {
            src: null // procedural only,
            volume: 0.4,
            variations: 4,
            fallback: 'procedural'
        },
        footstepRun: {
            src: null // procedural only,
            volume: 0.5,
            variations: 4,
            fallback: 'procedural'
        },

        // === AMBIENT ===
        ambientDrone: {
            src: null // procedural only,
            volume: 0.3,
            loop: true,
            fallback: 'procedural'
        },
        ambientWind: {
            src: null // procedural only,
            volume: 0.2,
            loop: true,
            fallback: 'procedural'
        },
        whisper: {
            src: null // procedural only,
            volume: 0.4,
            variations: 3,
            fallback: 'procedural'
        },
        distantScream: {
            src: null // procedural only,
            volume: 0.5,
            variations: 2,
            fallback: 'procedural'
        },
        creak: {
            src: null // procedural only,
            volume: 0.4,
            variations: 2,
            fallback: 'procedural'
        },
        metalScrape: {
            src: null // procedural only,
            volume: 0.4,
            variations: 1,
            fallback: 'procedural'
        },
        heartbeat: {
            src: null // procedural only,
            volume: 0.6,
            loop: true,
            fallback: 'procedural'
        }
    },

    // Currently playing ambient sounds (for stopping)
    activeAmbient: new Map(),

    // Initialize the audio system
    async init() {
        if (this.isInitialized) return true;

        try {
            // Create audio context
            this.context = new (window.AudioContext || window.webkitAudioContext)();

            // Create gain nodes for volume control
            this.masterGain = this.context.createGain();
            this.sfxGain = this.context.createGain();
            this.musicGain = this.context.createGain();

            // Connect gain chain: sfx/music -> master -> destination
            this.sfxGain.connect(this.masterGain);
            this.musicGain.connect(this.masterGain);
            this.masterGain.connect(this.context.destination);

            // Set initial volumes from user settings
            this.updateVolumes();

            // Create 3D audio listener
            this.listener = this.context.listener;

            this.isInitialized = true;
            console.log('[AudioManager] Initialized successfully');

            // Start loading sounds in background
            this.preloadSounds();

            return true;
        } catch (e) {
            console.error('[AudioManager] Failed to initialize:', e);
            return false;
        }
    },

    // Resume audio context (needed after user interaction)
    async resume() {
        if (this.context && this.context.state === 'suspended') {
            await this.context.resume();
        }
    },

    // Update volume levels - accepts optional parameters or reads from userSettings
    updateVolumes(master, sfx, music) {
        if (!this.masterGain) return;

        // Use provided values or fall back to userSettings
        const masterVol = master !== undefined ? master :
            (typeof userSettings !== 'undefined' ? userSettings.masterVolume : 0.7);
        const sfxVol = sfx !== undefined ? sfx :
            (typeof userSettings !== 'undefined' ? userSettings.sfxVolume : 1.0);
        const musicVol = music !== undefined ? music :
            (typeof userSettings !== 'undefined' ? userSettings.musicVolume : 0.5);

        this.masterGain.gain.value = masterVol;
        this.sfxGain.gain.value = sfxVol;
        this.musicGain.gain.value = musicVol;
    },

    // Preload all sound files
    async preloadSounds() {
        if (this.isLoading) return;
        this.isLoading = true;

        // Only load sounds that have a file path (src is not null)
        const soundsWithFiles = Object.entries(this.sounds).filter(([_, sound]) => sound.src !== null);
        this.totalCount = soundsWithFiles.length;
        this.loadedCount = 0;

        console.log(`[AudioManager] Preloading ${this.totalCount} sound files...`);

        const loadPromises = soundsWithFiles.map(async ([key, sound]) => {
            try {
                // Load main sound
                await this.loadSound(key, sound.src);

                // Load variations if any
                if (sound.variations > 1) {
                    for (let i = 2; i <= sound.variations; i++) {
                        const varSrc = sound.src.replace(/\.(mp3|ogg|wav)$/, `_${i}.$1`);
                        await this.loadSound(`${key}_${i}`, varSrc);
                    }
                }

                this.loadedCount++;
            } catch (e) {
                // Sound file not found - will use procedural fallback
                this.loadedCount++;
            }
        });

        await Promise.all(loadPromises);
        this.isLoading = false;
        console.log(`[AudioManager] Preload complete: ${this.buffers.size} sounds loaded`);
    },

    // Load a single sound file
    async loadSound(key, url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

            this.buffers.set(key, audioBuffer);
            return audioBuffer;
        } catch (e) {
            throw e; // Let caller handle
        }
    },

    // Play a sound effect
    play(soundName, options = {}) {
        if (!this.isInitialized) {
            this.init();
            return null;
        }

        // Resume context if suspended
        if (this.context.state === 'suspended') {
            this.context.resume();
        }

        const soundDef = this.sounds[soundName];
        if (!soundDef) {
            console.warn(`[AudioManager] Unknown sound: ${soundName}`);
            return null;
        }

        // Check for variations
        let bufferKey = soundName;
        if (soundDef.variations > 1) {
            const variation = Math.ceil(Math.random() * soundDef.variations);
            if (variation > 1) {
                bufferKey = `${soundName}_${variation}`;
            }
        }

        // Check if we have the audio buffer loaded
        const buffer = this.buffers.get(bufferKey) || this.buffers.get(soundName);

        if (buffer) {
            return this.playBuffer(buffer, soundDef, options);
        } else {
            // Use procedural fallback
            return this.playProcedural(soundName, soundDef, options);
        }
    },

    // Play an audio buffer
    playBuffer(buffer, soundDef, options = {}) {
        try {
            const source = this.context.createBufferSource();
            source.buffer = buffer;

            // Create gain for this sound
            const gainNode = this.context.createGain();
            const volume = (soundDef.volume || 1.0) * (options.volume || 1.0);
            gainNode.gain.value = volume;

            // Handle 3D positioning
            if (options.position) {
                const panner = this.context.createPanner();
                panner.panningModel = 'HRTF';
                panner.distanceModel = 'inverse';
                panner.refDistance = 1;
                panner.maxDistance = 50;
                panner.rolloffFactor = 1;
                panner.setPosition(
                    options.position.x || 0,
                    options.position.y || 0,
                    options.position.z || 0
                );

                source.connect(gainNode);
                gainNode.connect(panner);
                panner.connect(this.sfxGain);
            } else {
                source.connect(gainNode);
                gainNode.connect(this.sfxGain);
            }

            // Handle looping
            if (soundDef.loop || options.loop) {
                source.loop = true;
            }

            // Pitch variation
            if (options.pitch) {
                source.playbackRate.value = options.pitch;
            } else if (options.pitchVariation) {
                source.playbackRate.value = 1 + (Math.random() - 0.5) * options.pitchVariation;
            }

            source.start(0);

            return { source, gainNode };
        } catch (e) {
            console.error('[AudioManager] Error playing buffer:', e);
            return null;
        }
    },

    // Procedural sound fallbacks (improved versions)
    playProcedural(soundName, soundDef, options = {}) {
        try {
            const volume = (soundDef.volume || 1.0) * (options.volume || 1.0);
            const settings = typeof userSettings !== 'undefined' ? userSettings : { masterVolume: 0.7, sfxVolume: 1.0 };
            const finalVolume = volume * settings.masterVolume * settings.sfxVolume;

            switch (soundName) {
                case 'pistol':
                    return this.proceduralGunshot(finalVolume, 0.08, 200, 60);
                case 'smg':
                    return this.proceduralGunshot(finalVolume * 0.8, 0.05, 250, 80);
                case 'shotgun':
                    return this.proceduralShotgun(finalVolume);
                case 'rocket':
                    return this.proceduralRocket(finalVolume);
                case 'laser':
                    return this.proceduralLaser(finalVolume);
                case 'reload':
                    return this.proceduralReload(finalVolume);
                case 'weaponSwitch':
                    return this.proceduralSwitch(finalVolume);
                case 'shoot':
                    return this.proceduralGunshot(finalVolume, 0.08, 200, 60); // Same as pistol
                case 'hit':
                    return this.proceduralHit(finalVolume);
                case 'explosion':
                    return this.proceduralExplosion(finalVolume);
                case 'grenadeThrow':
                    return this.proceduralThrow(finalVolume);
                case 'zombieAttack':
                    return this.proceduralZombieAttack(finalVolume, options.position);
                case 'zombieDeath':
                    return this.proceduralZombieDeath(finalVolume, options.position);
                case 'zombieGrowl':
                    return this.proceduralZombieGrowl(finalVolume, options.position);
                case 'glass':
                    return this.proceduralGlass(finalVolume, options.position);
                case 'pickup':
                    return this.proceduralPickup(finalVolume);
                case 'killStreak':
                    return this.proceduralKillStreak(finalVolume);
                case 'lowHealth':
                    return this.proceduralLowHealth(finalVolume);
                case 'footstep':
                case 'footstepRun':
                    return this.proceduralFootstep(finalVolume);
                case 'heartbeat':
                    return this.proceduralHeartbeat(finalVolume);
                default:
                    return this.proceduralDefault(finalVolume);
            }
        } catch (e) {
            return null;
        }
    },

    // === PROCEDURAL SOUND GENERATORS (Improved) ===

    proceduralGunshot(volume, duration, freqStart, freqEnd) {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Noise burst for attack
        const noiseBuffer = this.createNoiseBuffer(duration);
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        // Highpass filter for crack
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 1000;

        // Lowpass for body
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(freqStart * 10, now);
        lowpass.frequency.exponentialRampToValueAtTime(freqEnd * 5, now + duration);

        // Gain envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        // Low frequency thump
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freqStart, now);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration * 0.5);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(volume * 0.5, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.5);

        // Connect noise path
        noiseSource.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(this.sfxGain);

        // Connect oscillator path
        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);

        noiseSource.start(now);
        noiseSource.stop(now + duration);
        osc.start(now);
        osc.stop(now + duration);

        return { noiseSource, osc };
    },

    proceduralShotgun(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;
        const duration = 0.3;

        // Multiple noise bursts for spread effect
        for (let i = 0; i < 3; i++) {
            const delay = i * 0.01;
            const noiseBuffer = this.createNoiseBuffer(duration);
            const source = ctx.createBufferSource();
            source.buffer = noiseBuffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2000, now + delay);
            filter.frequency.exponentialRampToValueAtTime(200, now + delay + duration);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(volume * (1 - i * 0.2), now + delay);
            gain.gain.exponentialRampToValueAtTime(0.01, now + delay + duration);

            source.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);

            source.start(now + delay);
            source.stop(now + delay + duration);
        }

        // Deep bass thump
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(volume * 0.7, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.3);

        return { osc };
    },

    proceduralRocket(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Whoosh sound
        const noiseBuffer = this.createNoiseBuffer(0.5);
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(200, now);
        filter.frequency.exponentialRampToValueAtTime(800, now + 0.3);
        filter.Q.value = 2;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        source.start(now);
        source.stop(now + 0.5);

        return { source };
    },

    proceduralLaser(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);

        const osc2 = ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(800, now);
        osc2.frequency.exponentialRampToValueAtTime(200, now + 0.15);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        const gain2 = ctx.createGain();
        gain2.gain.setValueAtTime(volume * 0.1, now);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        osc2.connect(gain2);
        gain.connect(this.sfxGain);
        gain2.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.15);
        osc2.start(now);
        osc2.stop(now + 0.15);

        return { osc, osc2 };
    },

    proceduralReload(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Click sounds
        const clicks = [0, 0.15, 0.4];
        clicks.forEach((delay, i) => {
            const noiseBuffer = this.createNoiseBuffer(0.05);
            const source = ctx.createBufferSource();
            source.buffer = noiseBuffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 2000 + i * 500;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(volume * 0.5, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.05);

            source.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);

            source.start(now + delay);
            source.stop(now + delay + 0.05);
        });

        return {};
    },

    proceduralSwitch(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.05);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.1);

        return { osc };
    },

    proceduralHit(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.15);

        return { osc };
    },

    proceduralExplosion(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Noise burst
        const noiseBuffer = this.createNoiseBuffer(0.8);
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 0.6);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        source.start(now);
        source.stop(now + 0.8);

        // Sub bass
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(volume * 0.8, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.6);

        return { source, osc };
    },

    proceduralThrow(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const noiseBuffer = this.createNoiseBuffer(0.15);
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        filter.Q.value = 1;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        source.start(now);
        source.stop(now + 0.15);

        return { source };
    },

    proceduralZombieAttack(volume, position) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100 + Math.random() * 30, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc.connect(filter);

        if (position) {
            const panner = ctx.createPanner();
            panner.setPosition(position.x || 0, position.y || 0, position.z || 0);
            filter.connect(panner);
            panner.connect(gain);
        } else {
            filter.connect(gain);
        }

        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.35);

        return { osc };
    },

    proceduralZombieDeath(volume, position) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150 + Math.random() * 50, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.5);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

        osc.connect(filter);

        if (position) {
            const panner = ctx.createPanner();
            panner.setPosition(position.x || 0, position.y || 0, position.z || 0);
            filter.connect(panner);
            panner.connect(gain);
        } else {
            filter.connect(gain);
        }

        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.6);

        return { osc };
    },

    proceduralZombieGrowl(volume, position) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const baseFreq = 50 + Math.random() * 30;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.setValueAtTime(baseFreq * 0.8, now + 0.3);
        osc.frequency.setValueAtTime(baseFreq * 1.1, now + 0.6);
        osc.frequency.setValueAtTime(baseFreq * 0.7, now + 1.0);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(volume * 0.4, now + 0.1);
        gain.gain.linearRampToValueAtTime(volume * 0.3, now + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

        osc.connect(filter);

        if (position) {
            const panner = ctx.createPanner();
            panner.setPosition(position.x || 0, position.y || 0, position.z || 0);
            filter.connect(panner);
            panner.connect(gain);
        } else {
            filter.connect(gain);
        }

        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 1.2);

        return { osc };
    },

    proceduralGlass(volume, position) {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Sharp noise burst for initial impact
        const noiseBuffer = this.createNoiseBuffer(0.15);
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        // High frequency filter for glassy sound
        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 2000;

        // Resonant bandpass for tinkle
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 6000;
        bandpass.Q.value = 5;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        noiseSource.connect(highpass);
        highpass.connect(bandpass);

        if (position) {
            const panner = ctx.createPanner();
            panner.setPosition(position.x || 0, position.y || 0, position.z || 0);
            bandpass.connect(panner);
            panner.connect(gain);
        } else {
            bandpass.connect(gain);
        }

        gain.connect(this.sfxGain);

        noiseSource.start(now);
        noiseSource.stop(now + 0.15);

        // Add tinkling shards
        for (let i = 0; i < 5; i++) {
            const delay = 0.02 + Math.random() * 0.1;
            const shardOsc = ctx.createOscillator();
            shardOsc.type = 'sine';
            shardOsc.frequency.value = 3000 + Math.random() * 5000;

            const shardGain = ctx.createGain();
            shardGain.gain.setValueAtTime(0, now + delay);
            shardGain.gain.linearRampToValueAtTime(volume * 0.2, now + delay + 0.01);
            shardGain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.08);

            shardOsc.connect(shardGain);
            shardGain.connect(this.sfxGain);

            shardOsc.start(now + delay);
            shardOsc.stop(now + delay + 0.08);
        }

        return { noiseSource };
    },

    proceduralPickup(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Pleasant ascending notes
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.01, now + i * 0.08);
            gain.gain.linearRampToValueAtTime(volume * 0.3, now + i * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.2);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.2);
        });

        return {};
    },

    proceduralKillStreak(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Triumphant chord
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(volume * 0.2, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(now + i * 0.05);
            osc.stop(now + 0.5);
        });

        return {};
    },

    proceduralLowHealth(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 200;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.3, now);
        gain.gain.setValueAtTime(0.01, now + 0.1);
        gain.gain.setValueAtTime(volume * 0.3, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.4);

        return { osc };
    },

    proceduralFootstep(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const noiseBuffer = this.createNoiseBuffer(0.08);
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800 + Math.random() * 400;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        source.start(now);
        source.stop(now + 0.08);

        return { source };
    },

    proceduralHeartbeat(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        // Lub
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 40;

        const gain1 = ctx.createGain();
        gain1.gain.setValueAtTime(volume * 0.4, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc1.connect(gain1);
        gain1.connect(this.sfxGain);
        osc1.start(now);
        osc1.stop(now + 0.15);

        // Dub
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 35;

        const gain2 = ctx.createGain();
        gain2.gain.setValueAtTime(volume * 0.3, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.3);

        return { osc1, osc2 };
    },

    proceduralDefault(volume) {
        const ctx = this.context;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.1);

        return { osc };
    },

    // Create a noise buffer for various effects
    createNoiseBuffer(duration) {
        const sampleRate = this.context.sampleRate;
        const bufferSize = sampleRate * duration;
        const buffer = this.context.createBuffer(1, bufferSize, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        return buffer;
    },

    // Play 3D positioned sound
    play3D(soundName, position, options = {}) {
        return this.play(soundName, { ...options, position });
    },

    // Update listener position (call every frame)
    updateListener(position, forward, up) {
        if (!this.listener) return;

        if (this.listener.positionX) {
            // Modern API
            this.listener.positionX.value = position.x;
            this.listener.positionY.value = position.y;
            this.listener.positionZ.value = position.z;
            this.listener.forwardX.value = forward.x;
            this.listener.forwardY.value = forward.y;
            this.listener.forwardZ.value = forward.z;
            this.listener.upX.value = up.x;
            this.listener.upY.value = up.y;
            this.listener.upZ.value = up.z;
        } else {
            // Legacy API
            this.listener.setPosition(position.x, position.y, position.z);
            this.listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
        }
    },

    // Start an ambient loop
    startAmbient(soundName) {
        if (this.activeAmbient.has(soundName)) return;

        const result = this.play(soundName, { loop: true });
        if (result) {
            this.activeAmbient.set(soundName, result);
        }
    },

    // Stop an ambient loop
    stopAmbient(soundName) {
        const active = this.activeAmbient.get(soundName);
        if (active) {
            try {
                if (active.source) active.source.stop();
                if (active.gainNode) active.gainNode.disconnect();
            } catch (e) {}
            this.activeAmbient.delete(soundName);
        }
    },

    // Stop all ambient sounds
    stopAllAmbient() {
        this.activeAmbient.forEach((active, name) => {
            this.stopAmbient(name);
        });
    },

    // Cleanup
    dispose() {
        this.stopAllAmbient();
        this.buffers.clear();
        if (this.context) {
            this.context.close();
        }
        this.isInitialized = false;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AudioManager = AudioManager;
}
