# EVM Calldata Decoder

A web application for decoding EVM calldata using [4byte.directory](https://www.4byte.directory/). Available at [calldata.georgeroman.dev](https://calldata.georgeroman.dev).

## Features

- Decode EVM calldata by looking up function selectors via [4byte.directory](https://www.4byte.directory/)
- Support for multiple matching signatures
- Decodes all ABI types (including nested tuples and arrays)

## Usage

1. Open `src/index.html` in a web browser
2. Paste your calldata (with or without `0x` prefix)
3. Click "Decode" or press `Ctrl+Enter`
4. Select from matching function signatures to decode parameters

## Example

```
0x23b872dd0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd0000000000000000000000000000000000000000000000000000000000000064
```

This decodes to `transferFrom(address,address,uint256)` with the corresponding parameters.

## License

MIT
