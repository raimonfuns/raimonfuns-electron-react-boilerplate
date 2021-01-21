import React from 'react';
import { observer, useLocalStore } from 'mobx-react-lite';
import classNames from 'classnames';
import In from './In';
import Out from './Out';

export default observer(() => {
  const state = useLocalStore(() => ({
    type: 'in',
  }));

  return (
    <div className="flex justify-center pt-10 exchanger">
      <div className="w-80 relative">
        <div className="flex items-center border-b border-gray-ec text-16 px-4 h-12 absolute top-0 left-0 z-20 w-full">
          <div
            className={classNames(
              {
                'font-bold text-indigo-400': state.type === 'in',
                'font-normal text-gray-bf': state.type !== 'in',
              },
              'py-2 px-4 cursor-pointer'
            )}
            onClick={() => {
              state.type = 'in';
            }}
          >
            存入
          </div>
          <div
            className={classNames(
              {
                'font-bold text-indigo-400': state.type === 'out',
                'font-normal text-gray-bf': state.type !== 'out',
              },
              'py-2 px-4 cursor-pointer'
            )}
            onClick={() => {
              state.type = 'out';
            }}
          >
            取回
          </div>
        </div>
        {state.type === 'in' && <In />}
        {state.type === 'out' && <Out />}
      </div>
    </div>
  );
});