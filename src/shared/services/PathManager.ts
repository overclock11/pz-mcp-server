import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

export interface GameInstallation {
  path: string;
  platform: 'steam' | 'epic' | 'gog' | 'standalone';
  version?: string;
  isValid: boolean;
}

export class PathManager {
  private commonPaths: string[] = [];
  private detectedInstallations: GameInstallation[] = [];

  constructor() {
    this.initializeCommonPaths();
  }

  private initializeCommonPaths(): void {
    const home = homedir();
    
    // Windows paths
    if (process.platform === 'win32') {
      this.commonPaths = [
        // Steam
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\ProjectZomboid',
        'C:\\Program Files\\Steam\\steamapps\\common\\ProjectZomboid',
        'D:\\Steam\\steamapps\\common\\ProjectZomboid',
        'E:\\Steam\\steamapps\\common\\ProjectZomboid',
        
        // Epic Games
        'C:\\Program Files\\Epic Games\\ProjectZomboid',
        'C:\\Program Files (x86)\\Epic Games\\ProjectZomboid',
        
        // GOG
        'C:\\Program Files (x86)\\GOG Galaxy\\Games\\ProjectZomboid',
        'C:\\Program Files\\GOG Galaxy\\Games\\ProjectZomboid',
        'C:\\GOG Games\\ProjectZomboid',
        
        // Standalone
        'C:\\ProjectZomboid',
        'C:\\Games\\ProjectZomboid',
      ];
    }
    // Linux paths
    else if (process.platform === 'linux') {
      this.commonPaths = [
        // Steam
        join(home, '.steam/debian-installation/steamapps/common/ProjectZomboid'),
        join(home, '.local/share/Steam/steamapps/common/ProjectZomboid'),
        '/usr/games/ProjectZomboid',
        
        // Standalone
        join(home, 'ProjectZomboid'),
        join(home, 'Games/ProjectZomboid'),
        '/opt/ProjectZomboid',
      ];
    }
    // macOS paths
    else if (process.platform === 'darwin') {
      this.commonPaths = [
        // Steam
        join(home, 'Library/Application Support/Steam/steamapps/common/ProjectZomboid'),
        '/Applications/ProjectZomboid.app/Contents',
        
        // Standalone
        join(home, 'Games/ProjectZomboid'),
        '/Applications/ProjectZomboid',
      ];
    }

    // WSL support - check Windows drives
    if (process.platform === 'linux' && process.env.WSL_DISTRO_NAME) {
      const wslPaths = [
        '/mnt/c/Program Files (x86)/Steam/steamapps/common/ProjectZomboid',
        '/mnt/c/Program Files/Steam/steamapps/common/ProjectZomboid',
        '/mnt/d/Steam/steamapps/common/ProjectZomboid',
        '/mnt/e/Steam/steamapps/common/ProjectZomboid',
        '/mnt/c/Program Files/Epic Games/ProjectZomboid',
        '/mnt/c/Program Files (x86)/Epic Games/ProjectZomboid',
      ];
      this.commonPaths.push(...wslPaths);
    }
  }

  async detectProjectZomboidPath(): Promise<string | null> {
    // First try to detect from Steam registry/config
    const steamPath = await this.detectSteamInstallation();
    if (steamPath) {
      return steamPath;
    }

    // Then try common installation paths
    for (const path of this.commonPaths) {
      if (this.isValidProjectZomboidInstallation(path)) {
        return path;
      }
    }

    // Try to find from environment variables
    const envPath = process.env.PROJECTZOMBOID_PATH || process.env.PZ_PATH;
    if (envPath && this.isValidProjectZomboidInstallation(envPath)) {
      return envPath;
    }

    return null;
  }

  async detectAllInstallations(): Promise<GameInstallation[]> {
    if (this.detectedInstallations.length > 0) {
      return this.detectedInstallations;
    }

    const installations: GameInstallation[] = [];

    // Check Steam installations
    const steamPath = await this.detectSteamInstallation();
    if (steamPath) {
      const steamVersion = this.getGameVersion(steamPath);
      installations.push({
        path: steamPath,
        platform: 'steam',
        ...(steamVersion !== undefined ? { version: steamVersion } : {}),
        isValid: true,
      });
    }

    // Check all common paths
    for (const path of this.commonPaths) {
      if (this.isValidProjectZomboidInstallation(path)) {
        const platform = this.detectPlatform(path);
        const version = this.getGameVersion(path);
        installations.push({
          path,
          platform,
          ...(version !== undefined ? { version } : {}),
          isValid: true,
        });
      }
    }

    // Remove duplicates based on path
    const uniqueInstallations = installations.filter(
      (installation, index, self) =>
        index === self.findIndex(i => i.path === installation.path)
    );

    this.detectedInstallations = uniqueInstallations;
    return uniqueInstallations;
  }

  private async detectSteamInstallation(): Promise<string | null> {
    try {
      if (process.platform === 'win32') {
        return await this.detectSteamWindows();
      } else if (process.platform === 'linux') {
        return await this.detectSteamLinux();
      } else if (process.platform === 'darwin') {
        return await this.detectSteamMacOS();
      }
    } catch (error) {
      console.warn('Failed to detect Steam installation:', error);
    }
    
    return null;
  }

  private async detectSteamWindows(): Promise<string | null> {
    // Try to read Steam installation paths from common locations
    const steamPaths = [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
    ];

    for (const steamPath of steamPaths) {
      const configPath = join(steamPath, 'steamapps', 'libraryfolders.vdf');
      if (existsSync(configPath)) {
        try {
          const configContent = readFileSync(configPath, 'utf-8');
          const libraries = this.parseSteamLibraryFolders(configContent);
          
          for (const library of libraries) {
            const pzPath = join(library, 'steamapps', 'common', 'ProjectZomboid');
            if (this.isValidProjectZomboidInstallation(pzPath)) {
              return pzPath;
            }
          }
        } catch (error) {
          console.warn('Failed to parse Steam library folders:', error);
        }
      }
    }

    return null;
  }

  private async detectSteamLinux(): Promise<string | null> {
    const home = homedir();
    const steamPaths = [
      join(home, '.steam/debian-installation'),
      join(home, '.local/share/Steam'),
      join(home, '.steam/steam'),
    ];

    for (const steamPath of steamPaths) {
      const configPath = join(steamPath, 'steamapps', 'libraryfolders.vdf');
      if (existsSync(configPath)) {
        try {
          const configContent = readFileSync(configPath, 'utf-8');
          const libraries = this.parseSteamLibraryFolders(configContent);
          
          for (const library of libraries) {
            const pzPath = join(library, 'steamapps', 'common', 'ProjectZomboid');
            if (this.isValidProjectZomboidInstallation(pzPath)) {
              return pzPath;
            }
          }
        } catch (error) {
          console.warn('Failed to parse Steam library folders:', error);
        }
      }
    }

    return null;
  }

  private async detectSteamMacOS(): Promise<string | null> {
    const home = homedir();
    const steamPath = join(home, 'Library/Application Support/Steam');
    const configPath = join(steamPath, 'steamapps', 'libraryfolders.vdf');
    
    if (existsSync(configPath)) {
      try {
        const configContent = readFileSync(configPath, 'utf-8');
        const libraries = this.parseSteamLibraryFolders(configContent);
        
        for (const library of libraries) {
          const pzPath = join(library, 'steamapps', 'common', 'ProjectZomboid');
          if (this.isValidProjectZomboidInstallation(pzPath)) {
            return pzPath;
          }
        }
      } catch (error) {
        console.warn('Failed to parse Steam library folders:', error);
      }
    }

    return null;
  }

  private parseSteamLibraryFolders(content: string): string[] {
    const libraries: string[] = [];
    
    // Parse VDF format to extract library paths
    const lines = content.split('\n');
    let inLibraryFolders = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '"libraryfolders"') {
        inLibraryFolders = true;
        continue;
      }
      
      if (inLibraryFolders && trimmed.includes('"path"')) {
        const match = trimmed.match(/"path"\s*"([^"]+)"/);
        if (match) {
          let path = match[1];
          // Handle escaped backslashes
          path = path.replace(/\\\\/g, '\\');
          libraries.push(path);
        }
      }
    }
    
    return libraries;
  }

  isValidProjectZomboidInstallation(path: string): boolean {
    if (!existsSync(path)) {
      return false;
    }

    // Check for key Project Zomboid files/directories
    const requiredPaths = [
      join(path, 'media'),
      join(path, 'media', 'scripts'),
    ];

    // Check for executable (varies by platform)
    const executables = [
      join(path, 'ProjectZomboid64.exe'),      // Windows 64-bit
      join(path, 'ProjectZomboid32.exe'),      // Windows 32-bit
      join(path, 'ProjectZomboid.exe'),        // Windows generic
      join(path, 'projectzomboid.sh'),         // Linux
      join(path, 'ProjectZomboid'),            // Linux binary
      join(path, 'Contents', 'MacOS', 'ProjectZomboid'), // macOS
    ];

    const hasExecutable = executables.some(exe => existsSync(exe));
    const hasRequiredPaths = requiredPaths.every(reqPath => existsSync(reqPath));

    return hasExecutable && hasRequiredPaths;
  }

  private detectPlatform(path: string): 'steam' | 'epic' | 'gog' | 'standalone' {
    const lowerPath = path.toLowerCase();
    
    if (lowerPath.includes('steam')) {
      return 'steam';
    } else if (lowerPath.includes('epic')) {
      return 'epic';
    } else if (lowerPath.includes('gog')) {
      return 'gog';
    } else {
      return 'standalone';
    }
  }

  private getGameVersion(gamePath: string): string | undefined {
    try {
      // Try to read version from various possible locations
      const versionFiles = [
        join(gamePath, 'version.txt'),
        join(gamePath, 'VERSION'),
        join(gamePath, 'media', 'version.txt'),
      ];

      for (const versionFile of versionFiles) {
        if (existsSync(versionFile)) {
          const content = readFileSync(versionFile, 'utf-8').trim();
          if (content) {
            return content;
          }
        }
      }

      // Try to extract version from executable or manifest files
      const manifestPath = join(gamePath, 'manifest.txt');
      if (existsSync(manifestPath)) {
        const manifest = readFileSync(manifestPath, 'utf-8');
        const versionMatch = manifest.match(/version[:\s]+([^\s\n]+)/i);
        if (versionMatch) {
          return versionMatch[1];
        }
      }
    } catch (error) {
      console.warn('Failed to detect game version:', error);
    }

    return undefined;
  }

  getUserZomboidPath(): string {
    const home = homedir();
    
    if (process.platform === 'win32') {
      return join(home, 'Zomboid');
    } else if (process.platform === 'linux') {
      // Check WSL
      if (process.env.WSL_DISTRO_NAME) {
        return '/mnt/c/Users/' + process.env.USER + '/Zomboid';
      }
      return join(home, '.zomboid');
    } else if (process.platform === 'darwin') {
      return join(home, 'Library/Application Support/Zomboid');
    }
    
    return join(home, 'Zomboid');
  }

  getModsPath(): string {
    return join(this.getUserZomboidPath(), 'mods');
  }

  getWorkshopPath(): string {
    return join(this.getUserZomboidPath(), 'Workshop');
  }

  resolvePathWithPriority(providedPath?: string): string | null {
    // Priority order:
    // 1. User-provided path
    // 2. Environment variable
    // 3. Auto-detected installation

    if (providedPath && this.isValidProjectZomboidInstallation(providedPath)) {
      return resolve(providedPath);
    }

    const envPath = process.env.PROJECTZOMBOID_PATH || process.env.PZ_PATH;
    if (envPath && this.isValidProjectZomboidInstallation(envPath)) {
      return resolve(envPath);
    }

    // Fallback to detection
    return null; // Will trigger auto-detection
  }
}
