"""Selects a registered look without changing the configuration file's identity."""
import sys


def select_look(config, argv):
    if config.get('frozen') is not True:
        sys.exit('config.json is not frozen: the test window is refused')
    if 'looks' not in config:
        if '--look' in argv:
            sys.exit('--look requires a configuration with registered looks')
        return None
    if argv.count('--look') != 1:
        sys.exit('--look N is required (1, 2 or 3)')
    i = argv.index('--look')
    if i + 1 >= len(argv) or argv[i + 1] not in ('1', '2', '3'):
        sys.exit('--look must be 1, 2 or 3')
    number = int(argv[i + 1])
    matches = [look for look in config['looks'] if look['number'] == number]
    if len(matches) != 1:
        sys.exit('the selected look is absent or repeated in the configuration')
    look = matches[0]
    config['runDateUtc'] = look['runDateUtc']
    config['messages'].update(through=look['runDateUtc'], createdBefore=look['createdBefore'])
    config['window']['finalTo'] = look['finalTo']
    config['sets']['createdBefore'] = look['createdBefore']
    config['statistics'].update(interval=look['interval'], minimumPrimaryEvents=look['minimumPrimaryEvents'],
                                seed=config['statistics']['seed'] + look['seedOffset'])
    return look
