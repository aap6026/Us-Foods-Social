import { Injectable } from '@angular/core';
import { Session } from '@app/models';
import { PinDialogComponent } from '@app/pin-dialog/pin-dialog.component';
import { State } from '@app/store';
import { sessionLocked, sessionRestored } from '@app/store/actions';
import {
  BrowserVault,
  DeviceSecurityType,
  IdentityVaultConfig,
  Vault,
  VaultType,
} from '@ionic-enterprise/identity-vault';
import { ModalController, Platform } from '@ionic/angular';
import { Store } from '@ngrx/store';

export type UnlockMode = 'Device' | 'SessionPIN' | 'NeverLock' | 'ForceLogin';

@Injectable({
  providedIn: 'root',
})
export class SessionVaultService {
  private vault: BrowserVault | Vault;
  private session: Session;
  private sessionKey = 'session';

  constructor(
    private modalController: ModalController,
    platform: Platform,
    private store: Store<State>,
  ) {
    const config: IdentityVaultConfig = {
      key: 'com.kensodemann.teataster',
      type: VaultType.SecureStorage,
      lockAfterBackgrounded: 5000,
      shouldClearVaultAfterTooManyFailedAttempts: true,
      customPasscodeInvalidUnlockAttempts: 2,
      unlockVaultOnLoad: false,
    };

    this.vault = platform.is('hybrid')
      ? new Vault(config)
      : new BrowserVault(config);

    this.vault.onLock(() => {
      this.session = undefined;
      this.store.dispatch(sessionLocked());
    });
  }

  async login(session: Session, unlockMode: UnlockMode): Promise<void> {
    this.session = session;
    await this.vault.setValue(this.sessionKey, session);
    await this.setUnlockMode(unlockMode);
  }

  async logout(): Promise<void> {
    this.session = undefined;
    return this.vault.clear();
  }

  async restoreSession(): Promise<Session> {
    if (!this.session) {
      this.session = await this.vault.getValue(this.sessionKey);
      this.store.dispatch(sessionRestored({ session: this.session }));
    }
    return this.session;
  }

  async canUnlock(): Promise<boolean> {
    return this.vault.isLocked();
  }

  async onPasscodeRequest(isPasscodeSetRequest: boolean): Promise<string> {
    const dlg = await this.modalController.create({
      backdropDismiss: false,
      component: PinDialogComponent,
      componentProps: {
        setPasscodeMode: isPasscodeSetRequest,
      },
    });
    dlg.present();
    const { data } = await dlg.onDidDismiss();
    return Promise.resolve(data || '');
  }

  setUnlockMode(unlockMode: UnlockMode): Promise<void> {
    let type: VaultType;
    let deviceSecurityType: DeviceSecurityType | undefined;

    switch (unlockMode) {
      case 'Device':
        type = VaultType.DeviceSecurity;
        deviceSecurityType = DeviceSecurityType.Both;
        break;

      case 'SessionPIN':
        type = VaultType.CustomPasscode;
        deviceSecurityType = undefined;
        break;

      case 'ForceLogin':
        type = VaultType.InMemory;
        deviceSecurityType = undefined;
        break;

      case 'NeverLock':
        type = VaultType.SecureStorage;
        deviceSecurityType = undefined;
        break;

      default:
        type = VaultType.SecureStorage;
        deviceSecurityType = DeviceSecurityType.SystemPasscode;
    }

    return this.vault.updateConfig({
      ...this.vault.config,
      type,
      deviceSecurityType,
    });
  }
}
