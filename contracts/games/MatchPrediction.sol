pragma solidity 0.5.0;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";


contract MatchPrediction {

    ERC721 nft;

    uint256 public result = 0;

    constructor (ERC721 _nft) public {
        nft = _nft;
    }

    function resultGame(uint256 _result)
    public returns (bool) {
        result = _result;
        return true;
    }
}