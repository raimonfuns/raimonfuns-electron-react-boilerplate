import React from 'react';
import { observer, useLocalStore } from 'mobx-react-lite';
import { BiChevronDown, BiArrowBack } from 'react-icons/bi';
import Button from 'components/Button';
import { TextField } from '@material-ui/core';
import classNames from 'classnames';
import CurrencySelectorModal from '../CurrencySelectorModal';
import { Finance, PrsAtm, sleep, getQuery, removeQuery } from 'utils';
import { divide, bignumber, larger } from 'mathjs';
import { isEmpty, debounce } from 'lodash';
import { useStore } from 'store';
import Fade from '@material-ui/core/Fade';

interface IDryRunResult {
  amount_a: string;
  amount_b: string;
  chainAccount: string;
  currency_a: string;
  currency_b: string;
  memo: string;
  notification: any;
  pool: string;
  receiver: string;
}

interface IAddLiquidResult {
  amount_a: string;
  amount_b: string;
  chainAccount: string;
  currency_a: string;
  currency_b: string;
  memo: string;
  notification: any;
  pool: string;
  receiver: string;
  payment_request: {
    payment_request: {
      [uuid: string]: {
        amount: string;
        currency: string;
        payment_url: string;
      };
    };
  };
}

export default observer(() => {
  const { poolStore, modalStore, walletStore, confirmDialogStore } = useStore();
  const state = useLocalStore(() => ({
    step: 1,
    dryRunning: false,
    submitting: false,
    checking: false,
    focusOn: 'a',
    currencyA: '',
    amountA: '',
    currencyB: '',
    amountB: '',
    paidA: false,
    paidB: false,
    openCurrencySelectorModal: false,
    accountName: '',
    showDryRunResult: false,
    dryRunResult: {} as IDryRunResult,
    addLiquidResult: {} as IAddLiquidResult,
    get hasDryRunResult() {
      return !isEmpty(this.dryRunResult);
    },
    get currencyPair() {
      return state.currencyA + state.currencyB;
    },
  }));

  React.useEffect(() => {
    (async () => {
      if (getQuery('currency_pair')) {
        state.currencyA = getQuery('currency_pair').split('-')[0];
        state.currencyB = getQuery('currency_pair').split('-')[1];
        removeQuery('currency_pair');
      } else {
        const [currencyA = '', currencyB = ''] = poolStore.currencies;
        state.currencyA = currencyA;
        state.currencyB = currencyB;
      }
    })();
  }, [state, poolStore]);

  React.useEffect(() => {
    return () => {
      PrsAtm.tryCancelPolling();
    };
  }, []);

  const dryRun = async () => {
    state.showDryRunResult = false;
    state.dryRunning = true;
    try {
      const resp: any = await PrsAtm.fetch({
        id: 'swapToken.addLiquid.dryrun',
        actions: ['exchange', 'addLiquid'],
        args: [
          null,
          null,
          state.focusOn === 'a' ? state.currencyA : state.currencyB,
          state.focusOn === 'a' ? state.amountA : state.amountB,
          state.focusOn === 'a' ? state.currencyB : state.currencyA,
          null,
          null,
          { dryrun: true },
        ],
        minPending: 600,
      });
      state.dryRunResult = resp as IDryRunResult;
      state.showDryRunResult = true;
      if (state.focusOn === 'a') {
        state.amountB = Finance.toString(state.dryRunResult.amount_b);
      } else {
        state.amountA = Finance.toString(state.dryRunResult.amount_b);
      }
    } catch (err) {
      state.dryRunResult = {} as IDryRunResult;
      console.log(err);
    }
    state.dryRunning = false;
  };

  const inputChangeDryRun = React.useCallback(debounce(dryRun, 500), []);

  const submit = () => {
    modalStore.verification.show({
      pass: (privateKey: string, accountName: string) => {
        state.accountName = accountName;
        (async () => {
          state.submitting = true;
          try {
            await PrsAtm.fetch({
              id: 'exchange.cancelSwap',
              actions: ['exchange', 'cancelSwap'],
              args: [privateKey, accountName],
            });
            const balance: any = await PrsAtm.fetch({
              id: 'getBalance',
              actions: ['account', 'getBalance'],
              args: [state.accountName],
            });
            walletStore.setBalance(balance);
          } catch (err) {}
          try {
            const resp: any = await PrsAtm.fetch({
              id: 'swapToken.addLiquid',
              actions: ['exchange', 'addLiquid'],
              args: [
                privateKey,
                accountName,
                state.currencyA,
                state.amountA,
                state.currencyB,
                null,
                null,
              ],
              minPending: 600,
            });
            state.addLiquidResult = resp as IAddLiquidResult;
            state.step = 2;
          } catch (err) {
            console.log(err);
          }
          state.submitting = false;
        })();
      },
    });
  };

  const done = async () => {
    state.checking = true;
    PrsAtm.polling(async () => {
      try {
        const balance: any = await PrsAtm.fetch({
          id: 'getBalance',
          actions: ['account', 'getBalance'],
          args: [state.accountName],
        });
        if (
          larger(
            balance[state.currencyPair],
            walletStore.balance[state.currencyPair]
          )
        ) {
          state.checking = false;
          state.step = 1;
          state.showDryRunResult = false;
          state.amountA = '';
          state.amountB = '';
          state.paidA = false;
          state.paidB = false;
          walletStore.setBalance(balance);
          confirmDialogStore.show({
            content: `存入成功。${state.currencyPair} 交易对已经转入你的资产`,
            okText: '我知道了',
            ok: () => confirmDialogStore.hide(),
            cancelDisabled: true,
          });
          return true;
        }
        return false;
      } catch (err) {
        return false;
      }
    }, 5000);
  };

  const payA = async () => {
    modalStore.quickPayment.show({
      skipVerification: true,
      amount: state.addLiquidResult.amount_a,
      currency: state.addLiquidResult.currency_a,
      pay: async () => {
        return Object.values(
          state.addLiquidResult.payment_request.payment_request
        )[0].payment_url;
      },
      checkResult: async () => {
        await sleep(1000);
        return true;
      },
      done: async () => {
        await sleep(500);
        state.paidA = true;
      },
    });
  };

  const payB = async () => {
    modalStore.quickPayment.show({
      skipVerification: true,
      amount: state.addLiquidResult.amount_b,
      currency: state.addLiquidResult.currency_b,
      pay: async () => {
        return Object.values(
          state.addLiquidResult.payment_request.payment_request
        )[1].payment_url;
      },
      checkResult: async () => {
        await sleep(1000);
        return true;
      },
      done: async () => {
        await sleep(500);
        state.paidB = true;
      },
    });
  };

  const step1 = () => (
    <div>
      <div className="flex items-center justify-between">
        <div
          className="font-bold flex items-center text-22 cursor-pointer"
          onClick={() => {
            state.focusOn = 'a';
            state.openCurrencySelectorModal = true;
          }}
        >
          {state.currencyA}
          <BiChevronDown className="text-18 ml-1" />
        </div>
        <div className="w-32 -mt-2">
          <TextField
            autoFocus
            value={state.amountA}
            onChange={(e) => {
              state.focusOn = 'a';
              state.amountA = e.target.value;
              inputChangeDryRun();
            }}
            margin="dense"
            variant="outlined"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div
          className="font-bold flex items-center text-22 cursor-pointer"
          onClick={() => {
            state.focusOn = 'to';
            state.openCurrencySelectorModal = true;
          }}
        >
          {state.currencyB}
          <BiChevronDown className="text-18 ml-1" />
        </div>
        <div className="w-32 -mt-2">
          <TextField
            value={state.amountB}
            onChange={(e) => {
              state.focusOn = 'b';
              state.amountB = e.target.value;
              inputChangeDryRun();
            }}
            margin="dense"
            variant="outlined"
          />
        </div>
      </div>
      <div className="mt-6">
        <Button
          fullWidth
          isDoing={state.dryRunning || state.submitting}
          hideText={state.dryRunning}
          color={state.showDryRunResult ? 'primary' : 'gray'}
          onClick={submit}
        >
          确定
        </Button>
      </div>
    </div>
  );

  const step2 = () => (
    <div className="relative">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <img
            src={Finance.currencyIconMap[state.currencyA]}
            alt="icon"
            className="rounded-full w-8 h-8 relative z-0"
          />
          <div className="text-15 ml-3 font-bold">
            {state.amountA} {state.currencyA}
          </div>
        </div>
        <Button
          size="small"
          outline
          onClick={payA}
          isDone={state.paidA}
          fixedDone
        >
          支付
        </Button>
      </div>
      <div className="flex justify-between items-center mt-4">
        <div className="flex items-center">
          <img
            src={Finance.currencyIconMap[state.currencyB]}
            alt="icon"
            className="rounded-full w-8 h-8 relative z-0"
          />
          <div className="text-15 ml-3 font-bold">
            {state.amountB} {state.currencyB}
          </div>
        </div>
        <Button
          size="small"
          outline
          onClick={payB}
          isDone={state.paidB}
          fixedDone
        >
          支付
        </Button>
      </div>
      <div className="mt-5 text-gray-bd leading-normal text-12">
        分别支付两个币种，然后点击完成。你会获得{state.currencyA}-
        {state.currencyB}{' '}
        交易对作为流动性证明，之后你随时可以用交易对换回这两个币种。
      </div>
      <div className="mt-4">
        <Button
          fullWidth
          isDoing={state.checking}
          color={
            state.showDryRunResult && state.paidA && state.paidB
              ? 'primary'
              : 'gray'
          }
          onClick={done}
        >
          {state.checking ? '核对支付结果' : '完成'}
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="bg-white rounded-12 shadow-lg text-gray-70 font-bold z-10 relative">
        <div className="pb-16 mb-2" />
        <div className="px-8 pb-6">
          <Fade in={true} timeout={500}>
            <div>
              {state.step === 1 && (
                <div>
                  <Fade in={true} timeout={500}>
                    <div>{step1()}</div>
                  </Fade>
                </div>
              )}
              {state.step === 2 && (
                <div>
                  <Fade in={true} timeout={500}>
                    <div>{step2()}</div>
                  </Fade>
                </div>
              )}
            </div>
          </Fade>
        </div>
      </div>
      {state.step === 2 && (
        <div
          className="px-4 text-20 cursor-pointer pr-5 h-12 flex items-center absolute top-0 left-0 w-full bg-white z-30 border-b border-gray-ec text-gray-88"
          onClick={() => {
            state.step = 1;
          }}
        >
          <BiArrowBack />
        </div>
      )}
      <div
        className={classNames(
          {
            show: state.showDryRunResult,
          },
          'z-0 absolute bottom-0 left-0 add-lp-detail w-full duration-500 ease-in-out transition-all'
        )}
      >
        {state.hasDryRunResult && (
          <div className="bg-white bg-opacity-75 text-12 px-6 pt-8 pb-4 leading-none mx-4 rounded-12 rounded-t-none">
            <div className="flex items-center justify-between mt-2">
              <div className="text-gray-88">存入比例</div>
              <div className="text-gray-70 font-bold">
                1 {state.currencyA} ={' '}
                {Finance.toString(
                  divide(
                    bignumber(state.dryRunResult.amount_b),
                    bignumber(state.dryRunResult.amount_a)
                  )
                )}{' '}
                {state.currencyB}
              </div>
            </div>
          </div>
        )}
      </div>
      <CurrencySelectorModal
        currentCurrency={
          state.focusOn === 'a' ? state.currencyA : state.currencyB
        }
        disabledCurrency={
          state.focusOn === 'a' ? state.currencyB : state.currencyA
        }
        open={state.openCurrencySelectorModal}
        onClose={(currency?: string) => {
          if (currency) {
            if (state.focusOn === 'a') {
              if (state.currencyA !== currency) {
                state.amountA = '';
              }
            } else {
              if (state.currencyB !== currency) {
                state.amountB = '';
              }
              state.amountB = '';
            }
          }
          state.openCurrencySelectorModal = false;
        }}
      />
      <style jsx>{`
        .add-lp-detail.show {
          bottom: -45px;
        }
        .add-lp-detail {
          bottom: 0;
        }
      `}</style>
      <style jsx global>{`
        .exchanger .MuiInputBase-root {
          font-weight: bold;
          color: #707070;
        }
        .exchanger .MuiInputBase-root.Mui-disabled {
          color: #707070;
        }
      `}</style>
    </div>
  );
});
