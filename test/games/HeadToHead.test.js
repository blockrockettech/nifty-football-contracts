const FutballCards = artifacts.require('FutballCards');
const HeadToHead = artifacts.require('HeadToHead');
const MockHeadToHeadResulter = artifacts.require('MockHeadToHeadResulter');

const {BN, constants, expectEvent, shouldFail} = require('openzeppelin-test-helpers');


contract.only('HeadToHead game tests', ([_, creator, tokenOwner1, tokenOwner2, anyone, ...accounts]) => {
    const baseURI = 'http://futball-cards';
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

    const State = {OPEN: new BN(0), HOME_WIN: new BN(1), AWAY_WIN: new BN(2), DRAW: new BN(3), CLOSED: new BN(4)};

    const _tokenId1 = new BN(0);
    const _tokenId2 = new BN(1);
    const _tokenId3 = new BN(2);

    beforeEach(async function () {
        // Create 721 contract
        this.futballCards = await FutballCards.new(baseURI, {from: creator});
        this.resulter = await MockHeadToHeadResulter.new({from: creator});

        this.headToHead = await HeadToHead.new(this.resulter.address, this.futballCards.address, {from: creator});

        (await this.futballCards.totalCards()).should.be.bignumber.equal('0');
    });

    context('should be able to play game', async function () {

        beforeEach(async function () {
            await this.futballCards.mintCard(1, 1, 1, 1, 1, tokenOwner1, {from: creator});
            await this.futballCards.setAttributes(_tokenId1, 10, 10, 10, 10, {from: creator});

            await this.futballCards.mintCard(2, 2, 2, 2, 2, tokenOwner2, {from: creator});
            await this.futballCards.setAttributes(_tokenId2, 5, 10, 20, 20, {from: creator});

            await this.futballCards.mintCard(3, 3, 3, 3, 3, anyone, {from: creator});
            await this.futballCards.setAttributes(_tokenId3, 30, 30, 30, 30, {from: creator});

            (await this.futballCards.totalCards()).should.be.bignumber.equal('3');
        });

        context('validation', async function () {

            context('when paused', async function () {
                beforeEach(async function () {
                    await this.headToHead.pause({from: creator});
                    (await this.headToHead.paused()).should.be.equal(true);
                });
                it('cant create game', async function () {
                    await shouldFail.reverting(this.headToHead.createGame(1, {from: tokenOwner2}));
                });
                it('cant result game', async function () {
                    await shouldFail.reverting(this.headToHead.resultGame(1, 1, {from: tokenOwner2}));
                });
                it('cant reMatch', async function () {
                    await shouldFail.reverting(this.headToHead.reMatch(1, {from: tokenOwner2}));

                });
                it('cant withdraw', async function () {
                    await shouldFail.reverting(this.headToHead.withdrawFromGame(1, {from: tokenOwner2}));
                });
            });

            context('when contract NOT approved', async function () {

                beforeEach(async function () {
                    await this.futballCards.setApprovalForAll(this.headToHead.address, false, {from: tokenOwner1});
                    await this.futballCards.setApprovalForAll(this.headToHead.address, false, {from: tokenOwner2});
                });

                it('cant create game when not approved', async function () {
                    await shouldFail.reverting.withMessage(
                        this.headToHead.createGame(1, {from: tokenOwner2}),
                        "NFT not approved to play"
                    );
                });

                it('cant result a game when not approved', async function () {
                    await shouldFail.reverting.withMessage(
                        this.headToHead.resultGame(1, 1, {from: tokenOwner1}),
                        "NFT not approved to play"
                    );
                });
            });

            context('when contract approved', async function () {

                beforeEach(async function () {
                    await this.futballCards.setApprovalForAll(this.headToHead.address, true, {from: tokenOwner1});
                    await this.futballCards.setApprovalForAll(this.headToHead.address, true, {from: tokenOwner2});
                });

                it('cant create game when not the owner', async function () {
                    await shouldFail.reverting.withMessage(
                        this.headToHead.createGame(0, {from: tokenOwner2}),
                        "You cannot enter if you dont own the card"
                    );
                });

                it('cant result a game for a token you dont own', async function () {
                    await shouldFail.reverting.withMessage(
                        this.headToHead.resultGame(1, 1, {from: tokenOwner1}),
                        "You cannot enter if you dont own the card"
                    );
                });

                it('cant result a game which does not exist', async function () {
                    await shouldFail.reverting.withMessage(
                        this.headToHead.resultGame(1, 1, {from: tokenOwner2}),
                        "Game not setup"
                    );
                });

                it('cant reMatch a game which does not exist', async function () {
                    await shouldFail.reverting.withMessage(
                        this.headToHead.reMatch(1, {from: tokenOwner2}),
                        "Game not in drawn state"
                    );
                });

            });

            context('joining multiple game', async function () {

                beforeEach(async function () {
                    await this.futballCards.setApprovalForAll(this.headToHead.address, true, {from: tokenOwner1});
                    await this.futballCards.setApprovalForAll(this.headToHead.address, true, {from: tokenOwner2});
                    await this.futballCards.setApprovalForAll(this.headToHead.address, true, {from: anyone});
                });

                it('cant create a new game if you are already playing', async function () {
                    await this.headToHead.createGame(_tokenId1, {from: tokenOwner1});
                    await shouldFail.reverting.withMessage(
                        this.headToHead.createGame(_tokenId1, {from: tokenOwner1}),
                        "Token already playing a game"
                    );
                });

                it('cant join an existing game if you are already playing', async function () {
                    await this.headToHead.createGame(_tokenId1, {from: tokenOwner1});

                    await this.headToHead.createGame(_tokenId3, {from: anyone});

                    await shouldFail.reverting.withMessage(
                        this.headToHead.resultGame(new BN(1), _tokenId1, {from: tokenOwner1}),
                        "Token already playing a game"
                    );
                });

            });
        });

        context('playing a game', async function () {

            beforeEach(async function () {
                await this.futballCards.setApprovalForAll(this.headToHead.address, true, {from: tokenOwner1});
                await this.futballCards.setApprovalForAll(this.headToHead.address, true, {from: tokenOwner2});
            });

            it('between token 0 (home) and 1 (away) and home wins', async function () {
                const _gameId = new BN(1);

                (await this.futballCards.ownerOf(_tokenId1)).should.be.equal(tokenOwner1);
                (await this.futballCards.ownerOf(_tokenId2)).should.be.equal(tokenOwner2);

                const {logs} = await this.headToHead.createGame(_tokenId1, {from: tokenOwner1});
                expectEvent.inLogs(logs,
                    `GameCreated`,
                    {
                        gameId: _gameId,
                        home: tokenOwner1,
                        homeTokenId: _tokenId1
                    }
                );

                const {homeTokenId, homeOwner, awayTokenId, awayOwner, state} = await this.headToHead.getGame(_gameId);
                homeTokenId.should.be.bignumber.equal(_tokenId1);
                homeOwner.should.be.equal(tokenOwner1);
                awayTokenId.should.be.bignumber.equal('0');
                awayOwner.should.be.equal(ZERO_ADDRESS);
                state.should.be.bignumber.equal(State.OPEN);

                // mock result
                await this.resulter.setResult(0);

                const {logs: resultLogs} = await this.headToHead.resultGame(_gameId, _tokenId2, {from: tokenOwner2});
                expectEvent.inLogs(resultLogs,
                    `GameResulted`,
                    {
                        home: tokenOwner1,
                        away: tokenOwner2,
                        gameId: _gameId,
                        homeValue: new BN(10),
                        awayValue: new BN(5),
                        result: new BN(0)
                    }
                );

                // token owner 1 now owns both
                (await this.futballCards.ownerOf(_tokenId1)).should.be.equal(tokenOwner1);
                (await this.futballCards.ownerOf(_tokenId2)).should.be.equal(tokenOwner1);

                // Check values on game set correctly
                const {awayTokenId: resultedAwayTokenId, awayOwner: resultedAwayOwner, state: resultedState} = await this.headToHead.getGame(_gameId);
                resultedState.should.be.bignumber.equal(State.HOME_WIN);
                resultedAwayTokenId.should.be.bignumber.equal(_tokenId2);
                resultedAwayOwner.should.be.equal(tokenOwner2);
            });

            it('between token 0 (home) and 1 (away) and away wins', async function () {
                const _gameId = new BN(1);

                (await this.futballCards.ownerOf(_tokenId1)).should.be.equal(tokenOwner1);
                (await this.futballCards.ownerOf(_tokenId2)).should.be.equal(tokenOwner2);

                const {logs} = await this.headToHead.createGame(_tokenId1, {from: tokenOwner1});
                expectEvent.inLogs(logs,
                    `GameCreated`,
                    {
                        gameId: _gameId,
                        home: tokenOwner1,
                        homeTokenId: _tokenId1
                    }
                );

                const {homeTokenId, homeOwner, awayTokenId, awayOwner, state} = await this.headToHead.getGame(_gameId);
                homeTokenId.should.be.bignumber.equal(_tokenId1);
                homeOwner.should.be.equal(tokenOwner1);
                awayTokenId.should.be.bignumber.equal('0');
                awayOwner.should.be.equal(ZERO_ADDRESS);
                state.should.be.bignumber.equal(State.OPEN);

                // mock result
                await this.resulter.setResult(3);

                const {logs: resultLogs} = await this.headToHead.resultGame(_gameId, _tokenId2, {from: tokenOwner2});
                expectEvent.inLogs(resultLogs,
                    `GameResulted`,
                    {
                        home: tokenOwner1,
                        away: tokenOwner2,
                        gameId: _gameId,
                        homeValue: new BN(10),
                        awayValue: new BN(20),
                        result: new BN(2)
                    }
                );

                // token owner 1 now owns both
                (await this.futballCards.ownerOf(_tokenId1)).should.be.equal(tokenOwner2);
                (await this.futballCards.ownerOf(_tokenId2)).should.be.equal(tokenOwner2);

                // Check values on game set correctly
                const {
                    homeTokenId: resultedHomeTokenId,
                    homeOwner: resultedHomeOwner,
                    awayTokenId: resultedAwayTokenId,
                    awayOwner: resultedAwayOwner,
                    state: resultedState
                } = await this.headToHead.getGame(_gameId);

                resultedState.should.be.bignumber.equal(State.AWAY_WIN);

                resultedHomeTokenId.should.be.bignumber.equal(_tokenId1);
                resultedHomeOwner.should.be.equal(tokenOwner1);

                resultedAwayTokenId.should.be.bignumber.equal(_tokenId2);
                resultedAwayOwner.should.be.equal(tokenOwner2);
            });

            it('between token 0 (home) and 1 (away) and the game is drawn', async function () {
                const _gameId = new BN(1);

                (await this.futballCards.ownerOf(_tokenId1)).should.be.equal(tokenOwner1);
                (await this.futballCards.ownerOf(_tokenId2)).should.be.equal(tokenOwner2);

                await this.headToHead.createGame(_tokenId1, {from: tokenOwner1});

                const {homeTokenId, homeOwner, awayTokenId, awayOwner, state} = await this.headToHead.getGame(_gameId);
                homeTokenId.should.be.bignumber.equal(_tokenId1);
                homeOwner.should.be.equal(tokenOwner1);
                awayTokenId.should.be.bignumber.equal('0');
                awayOwner.should.be.equal(ZERO_ADDRESS);
                state.should.be.bignumber.equal(State.OPEN);

                // mock result to 3 so we draw
                await this.resulter.setResult(2);

                const {logs} = await this.headToHead.resultGame(_gameId, _tokenId2, {from: tokenOwner2});
                expectEvent.inLogs(logs,
                    `GameDraw`,
                    {
                        home: tokenOwner1,
                        away: tokenOwner2,
                        gameId: _gameId,
                        homeValue: new BN(10),
                        awayValue: new BN(10),
                        result: new BN(1) // zero indexed
                    }
                );

                // token owner 1 now owns both
                (await this.futballCards.ownerOf(_tokenId1)).should.be.equal(tokenOwner1);
                (await this.futballCards.ownerOf(_tokenId2)).should.be.equal(tokenOwner2);

                // Check values on game set correctly
                const {
                    homeTokenId: resultedHomeTokenId,
                    homeOwner: resultedHomeOwner,
                    awayTokenId: resultedAwayTokenId,
                    awayOwner: resultedAwayOwner,
                    state: resultedState
                } = await this.headToHead.getGame(_gameId);
                resultedState.should.be.bignumber.equal(State.DRAW);

                resultedHomeTokenId.should.be.bignumber.equal(_tokenId1);
                resultedHomeOwner.should.be.equal(tokenOwner1);

                resultedAwayTokenId.should.be.bignumber.equal(_tokenId2);
                resultedAwayOwner.should.be.equal(tokenOwner2);
            });

        });
    });

});