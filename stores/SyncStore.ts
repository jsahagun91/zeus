import { action, observable } from 'mobx';
import ReactNativeBlobUtil from 'react-native-blob-util';

import BackendUtils from '../utils/BackendUtils';
import { sleep } from '../utils/SleepUtils';

import NodeInfo from '../models/NodeInfo';

import SettingsStore from './SettingsStore';

export default class SyncStore {
    @observable public isSyncing: boolean = false;
    @observable public syncStatusUpdatesPaused: boolean = false;
    @observable public isInExpressGraphSync: boolean = false;
    @observable public bestBlockHeight: number;
    @observable public initialKnownBlockHeight: number;
    @observable public currentBlockHeight: number;
    @observable public currentProgress: number;
    @observable public numBlocksUntilSynced: number;
    @observable public error: boolean = false;
    nodeInfo: any;
    settingsStore: SettingsStore;

    constructor(settingsStore: SettingsStore) {
        this.settingsStore = settingsStore;
    }

    @action
    public reset = () => {
        this.isSyncing = false;
        this.syncStatusUpdatesPaused = false;
        this.isInExpressGraphSync = false;
        this.error = false;
    };

    setExpressGraphSyncStatus = (syncing: boolean) => {
        this.isInExpressGraphSync = syncing;
    };

    setSyncInfo = (isInitialCall?: boolean) => {
        const nodeInfo = this.nodeInfo;

        if (isInitialCall)
            this.initialKnownBlockHeight = nodeInfo?.block_height ?? 0;

        if (this.currentBlockHeight !== nodeInfo?.block_height) {
            this.currentBlockHeight = nodeInfo?.block_height;
            this.currentProgress =
                (nodeInfo?.block_height ?? 0) - (this.bestBlockHeight ?? 0);
            this.numBlocksUntilSynced =
                (this.bestBlockHeight ?? 0) - this.currentBlockHeight;
        }

        // PEGASUS TODO get new best block height when we hit 0 or lower
        if (nodeInfo?.synced_to_chain || this.numBlocksUntilSynced <= 0)
            this.isSyncing = false;

        return;
    };

    getNodeInfo = () => {
        return BackendUtils.getMyNodeInfo().then((data: any) => {
            const nodeInfo = new NodeInfo(data);
            this.nodeInfo = nodeInfo;
            return nodeInfo;
        });
    };

    @action
    public pauseSyncingUpates = () => {
        this.syncStatusUpdatesPaused = true;
    };

    @action
    public resumeSyncingUpates = () => {
        this.syncStatusUpdatesPaused = false;
        this.startSyncing(true);
    };

    @action
    public startSyncing = (skipWait?: boolean) => {
        this.isSyncing = true;
        if (!skipWait) sleep(6000);

        ReactNativeBlobUtil.fetch(
            'get',
            `https://mempool.space/${
                this.settingsStore.embeddedLndNetwork === 'Testnet'
                    ? 'testnet/'
                    : ''
            }api/blocks/tip/height`
        )
            .then(async (response: any) => {
                const status = response.info().status;
                if (status == 200) {
                    this.bestBlockHeight = Number.parseInt(response.json());

                    // initial fetch
                    await this.getNodeInfo().then(() => this.setSyncInfo(true));

                    while (
                        this.numBlocksUntilSynced > 0 &&
                        !this.syncStatusUpdatesPaused
                    ) {
                        sleep(2000);
                        await this.getNodeInfo().then(() => this.setSyncInfo());
                    }
                } else {
                    this.error = true;
                }
            })
            .catch(() => {
                this.error = true;
            });
    };
}
